function Update-ZeppAzureToken {
    <#
    .SYNOPSIS
        Securely updates the API token in an Azure Function without portal access.

    .DESCRIPTION
        This cmdlet allows you to update the API token returned by your Azure Function
        directly from the command line without needing to edit code in the Azure Portal.
        
        The token can be provided as a parameter or entered securely when prompted.
        This is useful when portal editing is disabled or when you want to script token updates.

    .PARAMETER ResourceGroupName
        Name of the Azure Resource Group containing the Function App.

    .PARAMETER FunctionAppName
        Name of the Azure Function App.

    .PARAMETER Token
        The new API token value. If not provided, you will be prompted to enter it securely.

    .PARAMETER Message
        Optional custom message to include in the response. Defaults to a standard message.

    .PARAMETER LoadConfig
        Loads ResourceGroupName and FunctionAppName from saved configuration file.

    .EXAMPLE
        Update-ZeppAzureToken -ResourceGroupName "rg-zeppnightscout" -FunctionAppName "func-zepptoken"
        
        Prompts you to securely enter the new token and updates the function.

    .EXAMPLE
        Update-ZeppAzureToken -LoadConfig
        
        Loads configuration from saved file and prompts for the new token (recommended method).

    .EXAMPLE
        Update-ZeppAzureToken -LoadConfig -Token "my-secret-token-abc123" -Message "Production API token"
        
        Updates using saved configuration with specified token and custom message.
        WARNING: Passing tokens as parameters makes them visible in command history and process lists.
        Use the secure prompt method (without -Token parameter) for better security.

    .NOTES
        Prerequisites:
        - Azure PowerShell (Az module) - pre-installed in Azure Cloud Shell
        - User must be logged in to Azure (Connect-AzAccount)
        - User must have permissions to access and update the function
        
        This cmdlet updates the function code by modifying the __init__.py file.
        It preserves all other aspects of the function configuration.
    #>

    [CmdletBinding(DefaultParameterSetName = "Direct")]
    param(
        [Parameter(Mandatory = $true, ParameterSetName = "Direct")]
        [string]$ResourceGroupName,

        [Parameter(Mandatory = $true, ParameterSetName = "Direct")]
        [string]$FunctionAppName,

        [Parameter(Mandatory = $false, ParameterSetName = "Direct")]
        [Parameter(Mandatory = $false, ParameterSetName = "LoadConfig")]
        [string]$Token,

        [Parameter(Mandatory = $false, ParameterSetName = "Direct")]
        [Parameter(Mandatory = $false, ParameterSetName = "LoadConfig")]
        [string]$Message = "This is a Nightscout API token",

        [Parameter(Mandatory = $true, ParameterSetName = "LoadConfig")]
        [switch]$LoadConfig
    )

    # Set error action preference
    $ErrorActionPreference = "Stop"

    # Get config file path
    $configPath = Get-ConfigFilePath

    # Load configuration if requested
    if ($LoadConfig) {
        Write-ColorOutput "Loading configuration from file..." "Yellow"
        $loadedConfig = Load-ZeppConfig -ConfigPath $configPath
        
        if ($null -eq $loadedConfig) {
            throw "Failed to load configuration. Please run Set-ZeppAzureFunction with parameters and -SaveConfig first."
        }
        
        # Apply loaded configuration
        $ResourceGroupName = $loadedConfig.ResourceGroupName
        $FunctionAppName = $loadedConfig.FunctionAppName
        
        Write-Host ""
    }

    # Prompt for token if not provided
    if ([string]::IsNullOrWhiteSpace($Token)) {
        Write-Host ""
        Write-ColorOutput "Enter the new API token (input will be hidden):" "Cyan"
        $secureToken = Read-Host -AsSecureString
        
        # Convert secure string to plain text
        $BSTR = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureToken)
        try {
            $Token = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($BSTR)
        } finally {
            # Clear sensitive data from memory
            [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($BSTR)
            Remove-Variable -Name BSTR -ErrorAction SilentlyContinue
        }
        
        if ([string]::IsNullOrWhiteSpace($Token)) {
            throw "Token cannot be empty. Operation cancelled."
        }
    }

    try {
        Write-ColorOutput "================================================" "Cyan"
        Write-ColorOutput "  Azure Function Token Update" "Cyan"
        Write-ColorOutput "================================================" "Cyan"
        Write-Host ""

        # Check if Az module is available
        Write-ColorOutput "Checking prerequisites..." "Yellow"
        if (-not (Get-Module -ListAvailable -Name Az.Functions)) {
            Write-ColorOutput "Az.Functions module not found. Installing..." "Yellow"
            Install-Module -Name Az.Functions -Force -AllowClobber -Scope CurrentUser
        }

        # Import required modules
        Import-Module Az.Functions -ErrorAction SilentlyContinue
        Write-ColorOutput "✓ Prerequisites ready" "Green"
        Write-Host ""

        # Verify function app exists
        Write-ColorOutput "Verifying Function App '$FunctionAppName'..." "Yellow"
        $functionApp = Get-AzFunctionApp -ResourceGroupName $ResourceGroupName -Name $FunctionAppName -ErrorAction SilentlyContinue
        if (-not $functionApp) {
            throw "Function App '$FunctionAppName' not found in resource group '$ResourceGroupName'."
        }
        Write-ColorOutput "✓ Function App verified" "Green"
        Write-Host ""

        # Get publishing credentials
        Write-ColorOutput "Retrieving deployment credentials..." "Yellow"
        $publishingProfile = Invoke-AzResourceAction `
            -ResourceType "Microsoft.Web/sites/config" `
            -ResourceGroupName $ResourceGroupName `
            -ResourceName "$FunctionAppName/publishingcredentials" `
            -Action list `
            -ApiVersion "2022-03-01" `
            -Force
        
        $username = $publishingProfile.Properties.publishingUserName
        $password = $publishingProfile.Properties.publishingPassword
        
        # Create Basic Auth header
        $base64AuthInfo = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("${username}:${password}"))
        Write-ColorOutput "✓ Credentials retrieved" "Green"
        Write-Host ""

        # Download current function code
        Write-ColorOutput "Downloading current function code..." "Yellow"
        $vfsUrl = "https://$FunctionAppName.scm.azurewebsites.net/api/vfs/site/wwwroot/GetToken/__init__.py"
        $headers = @{
            Authorization = "Basic $base64AuthInfo"
        }
        
        try {
            $currentCode = Invoke-RestMethod -Uri $vfsUrl -Method Get -Headers $headers
            Write-ColorOutput "✓ Current code downloaded" "Green"
        } catch {
            Write-ColorOutput "Warning: Could not download current code. Will use template instead." "Yellow"
            $currentCode = $null
        }
        Write-Host ""

        # Update the token in the code
        Write-ColorOutput "Updating token value..." "Yellow"
        
        # Escape special characters in token and message for JSON
        # Backslash must be escaped FIRST to avoid double-escaping other characters
        $escapedToken = $Token -replace '\\', '\\\\' -replace '"', '\"' -replace "`n", '\n' -replace "`r", '\r' -replace "`t", '\t'
        $escapedMessage = $Message -replace '\\', '\\\\' -replace '"', '\"' -replace "`n", '\n' -replace "`r", '\r' -replace "`t", '\t'
        
        if ($currentCode) {
            # Update existing code - preserve everything except the token and message values
            # Regex matches the field name, opening quote, any content (including escaped chars), and closing quote
            # Pattern: [^"\\]* matches non-quote/non-backslash, \\. matches escaped char sequence
            $updatedCode = $currentCode -replace '("token":\s*")[^"\\]*(?:\\.[^"\\]*)*(")', "`${1}$escapedToken`${2}"
            $updatedCode = $updatedCode -replace '("message":\s*")[^"\\]*(?:\\.[^"\\]*)*(")', "`${1}$escapedMessage`${2}"
        } else {
            # Use template code with new token
            # Use single-quoted here-string to avoid variable expansion, then replace placeholders
            $templateCode = @'
import logging
import json
import traceback
import azure.functions as func

# Configuration constants
MAX_BODY_LOG_SIZE = 1024 * 1024  # 1MB
SENSITIVE_PARAM_NAMES = {'code', 'key', 'token', 'secret', 'password', 'api_key', 'apikey', 'auth'}
SENSITIVE_HEADER_NAMES = {'authorization', 'x-functions-key', 'cookie'}

def main(req: func.HttpRequest) -> func.HttpResponse:
    """
    HTTP trigger function that returns an API token.
    
    This function can be edited directly in the Azure Portal.
    Simply navigate to your Function App, select this function,
    and use the Code + Test feature to modify the response.
    """
    try:
        # Log function invocation with detailed request information
        logging.info('=== GetToken Function Invoked ===')
        logging.info(f'Request Method: {req.method}')
        logging.info(f'Request URL: {req.url}')
        
        # Log query parameters (if any)
        try:
            params = dict(req.params)
            # Mask sensitive data in logs (using set for O(1) lookup performance)
            for param_name in params:
                param_name_lower = param_name.lower()
                if param_name_lower in SENSITIVE_PARAM_NAMES:
                    params[param_name] = '***REDACTED***'
            logging.info(f'Query Parameters: {params}')
        except Exception as e:
            logging.warning(f'Could not parse query parameters: {str(e)}')
        
        # Log headers (exclude sensitive ones - using set for O(1) lookup performance)
        try:
            safe_headers = {}
            for key, value in req.headers.items():
                key_lower = key.lower()
                if key_lower in SENSITIVE_HEADER_NAMES:
                    safe_headers[key] = '***REDACTED***'
                else:
                    safe_headers[key] = value
            logging.info(f'Request Headers: {safe_headers}')
        except Exception as e:
            logging.warning(f'Could not parse headers: {str(e)}')
        
        # Log request body (if present, with size limit protection)
        try:
            body = req.get_body()
            if body:
                body_len = len(body)
                # Protect against logging very large bodies
                if body_len > MAX_BODY_LOG_SIZE:
                    logging.info(f'Request Body Length: {body_len} bytes (too large for detailed logging)')
                else:
                    logging.info(f'Request Body Length: {body_len} bytes')
        except Exception as e:
            logging.warning(f'Could not read request body: {str(e)}')
        
        logging.info('Generating token response...')
        
        # Prepare the response data
        response_data = {
            "token": "{{TOKEN_PLACEHOLDER}}",
            "message": "{{MESSAGE_PLACEHOLDER}}"
        }
        
        # Convert to JSON
        response_json = json.dumps(response_data)
        logging.info(f'Response prepared successfully: {len(response_json)} bytes')
        
        # Return the token
        response = func.HttpResponse(
            body=response_json,
            mimetype="application/json",
            status_code=200
        )
        
        logging.info('=== GetToken Function Completed Successfully ===')
        return response
        
    except Exception as e:
        # Comprehensive error logging
        logging.error('=== GetToken Function ERROR ===')
        logging.error(f'Exception Type: {type(e).__name__}')
        logging.error(f'Exception Message: {str(e)}')
        logging.error(f'Traceback: {traceback.format_exc()}')
        
        # Return generic error response (detailed error info is in logs only)
        error_response = {
            "error": "Internal server error",
            "message": "An error occurred while processing your request. Please check the function logs for details."
        }
        
        return func.HttpResponse(
            body=json.dumps(error_response),
            mimetype="application/json",
            status_code=500
        )
'@
            # Replace placeholders with actual values
            $updatedCode = $templateCode -replace '\{\{TOKEN_PLACEHOLDER\}\}', $escapedToken
            $updatedCode = $updatedCode -replace '\{\{MESSAGE_PLACEHOLDER\}\}', $escapedMessage
        }
        
        Write-ColorOutput "✓ Token updated in code" "Green"
        Write-Host ""

        # Upload updated code
        Write-ColorOutput "Uploading updated function code..." "Yellow"
        try {
            Invoke-RestMethod -Uri $vfsUrl -Method Put -Headers $headers -Body $updatedCode -ContentType "text/plain" | Out-Null
            Write-ColorOutput "✓ Function code uploaded successfully" "Green"
        } catch {
            throw "Failed to upload updated code: $($_.Exception.Message)"
        }
        Write-Host ""

        # Clear sensitive data from memory
        Remove-Variable -Name Token -ErrorAction SilentlyContinue
        Remove-Variable -Name escapedToken -ErrorAction SilentlyContinue
        Remove-Variable -Name username -ErrorAction SilentlyContinue
        Remove-Variable -Name password -ErrorAction SilentlyContinue
        Remove-Variable -Name base64AuthInfo -ErrorAction SilentlyContinue

        Write-ColorOutput "================================================" "Cyan"
        Write-ColorOutput "  Token Updated Successfully! ✓" "Green"
        Write-ColorOutput "================================================" "Cyan"
        Write-Host ""
        Write-ColorOutput "Resource Group:   $ResourceGroupName" "White"
        Write-ColorOutput "Function App:     $FunctionAppName" "White"
        Write-ColorOutput "Function Name:    GetToken" "White"
        Write-Host ""
        Write-ColorOutput "The token has been updated in your Azure Function." "Cyan"
        Write-ColorOutput "Changes take effect immediately - no restart required." "Cyan"
        Write-Host ""

    } catch {
        Write-ColorOutput "" "Red"
        Write-ColorOutput "================================================" "Red"
        Write-ColorOutput "  ERROR: $($_.Exception.Message)" "Red"
        Write-ColorOutput "================================================" "Red"
        Write-Host ""
        throw
    }
}
