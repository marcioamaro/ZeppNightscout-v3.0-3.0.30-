function Test-ZeppAzureFunction {
    <#
    .SYNOPSIS
        Tests a deployed Azure Function to verify it returns the expected API token response.

    .DESCRIPTION
        This cmdlet tests a deployed Azure Function by making an HTTP request to the function URL
        and validating that it returns the expected JSON payload with a token field.
        
        The function validates:
        - HTTP connectivity to the function endpoint
        - Valid JSON response format
        - Presence of required 'token' field
        - Optional validation of 'message' field

    .PARAMETER FunctionUrl
        The complete URL of the Azure Function to test, including any query parameters (like the code parameter).
        Example: https://zeppnsapi.azurewebsites.net/api/GetToken?code=your-function-key

    .PARAMETER ExpectedToken
        Optional. The expected token value to verify. If not provided, only checks that a token field exists.

    .PARAMETER LoadConfig
        Loads configuration from a previously saved file (created with Set-ZeppAzureFunction -SaveConfig)
        and constructs the function URL automatically.

    .EXAMPLE
        Test-ZeppAzureFunction -FunctionUrl "https://zeppnsapi.azurewebsites.net/api/GetToken?code=abc123"
        
        Tests the function and validates it returns a JSON response with a token field.

    .EXAMPLE
        Test-ZeppAzureFunction -FunctionUrl "https://zeppnsapi.azurewebsites.net/api/GetToken?code=abc123" -ExpectedToken "DUMMY-TOKEN"
        
        Tests the function and validates it returns "DUMMY-TOKEN" as the token value.

    .EXAMPLE
        Test-ZeppAzureFunction -LoadConfig
        
        Tests the function using configuration loaded from a previously saved file.

    .NOTES
        This cmdlet uses Invoke-RestMethod to make HTTP requests.
        Ensure you have network connectivity to the Azure Function endpoint.
    #>

    [CmdletBinding(DefaultParameterSetName = "Direct")]
    param(
        [Parameter(Mandatory = $true, ParameterSetName = "Direct")]
        [string]$FunctionUrl,

        [Parameter(Mandatory = $false, ParameterSetName = "Direct")]
        [string]$ExpectedToken,

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
        $loadedConfig = LoadZeppConfigInternal -ConfigPath $configPath
        
        if ($null -eq $loadedConfig) {
            throw "Failed to load configuration. Please run Set-ZeppAzureFunction with parameters and -SaveConfig first."
        }
        
        # Build function URL from saved configuration
        if (-not $loadedConfig.FunctionAppName) {
            throw "Configuration file does not contain FunctionAppName."
        }
        
        # Validate FunctionAppName format (alphanumeric and hyphens only)
        if (-not (Test-FunctionAppName -FunctionAppName $loadedConfig.FunctionAppName)) {
            throw "Invalid FunctionAppName in configuration: contains invalid characters."
        }
        
        $FunctionUrl = "https://$($loadedConfig.FunctionAppName).azurewebsites.net/api/GetToken"
        
        Write-ColorOutput "✓ Function URL constructed from config: $FunctionUrl" "Green"
        Write-Host ""
    }

    try {
        Write-ColorOutput "================================================" "Cyan"
        Write-ColorOutput "  Azure Function Test" "Cyan"
        Write-ColorOutput "================================================" "Cyan"
        Write-Host ""

        # Validate URL format
        Write-ColorOutput "Validating function URL..." "Yellow"
        if ($FunctionUrl -notmatch '^https?://') {
            throw "Function URL must start with http:// or https://"
        }
        Write-ColorOutput "✓ URL format is valid" "Green"
        Write-Host ""

        # Make HTTP request to the function
        Write-ColorOutput "Testing HTTP connectivity..." "Yellow"
        Write-ColorOutput "URL: $FunctionUrl" "White"
        
        try {
            $response = Invoke-RestMethod -Uri $FunctionUrl -ErrorAction Stop
        } catch {
            Write-ColorOutput "✗ Failed to connect to the function" "Red"
            Write-ColorOutput "Error: $($_.Exception.Message)" "Red"
            
            if ($_.Exception.Response) {
                $statusCode = [int]$_.Exception.Response.StatusCode
                Write-ColorOutput "HTTP Status Code: $statusCode" "Red"
            }
            
            throw "Failed to connect to Azure Function"
        }
        
        Write-ColorOutput "✓ Successfully connected to function" "Green"
        Write-Host ""

        # Validate response structure
        Write-ColorOutput "Validating response structure..." "Yellow"
        
        # Check if response is an object (PowerShell converts JSON to PSCustomObject)
        if ($null -eq $response -or $response -eq '') {
            throw "Response is empty or null"
        }
        Write-ColorOutput "✓ Response is not empty" "Green"
        
        # Check for token field
        if (-not ($response.PSObject.Properties.Name -contains "token")) {
            throw "Response does not contain required 'token' field"
        }
        Write-ColorOutput "✓ Response contains 'token' field" "Green"
        
        $tokenValue = if ($null -eq $response.token) { '<null>' } else { $response.token }
        Write-ColorOutput "  Token value: $tokenValue" "White"
        
        # Check for message field (optional but expected)
        if ($response.PSObject.Properties.Name -contains "message") {
            Write-ColorOutput "✓ Response contains 'message' field" "Green"
            Write-ColorOutput "  Message: $($response.message)" "White"
        } else {
            Write-ColorOutput "⚠ Response does not contain 'message' field (optional)" "Yellow"
        }
        Write-Host ""

        # Validate expected token if provided
        if ($ExpectedToken) {
            Write-ColorOutput "Validating token value..." "Yellow"
            if ($tokenValue -eq $ExpectedToken) {
                Write-ColorOutput "✓ Token matches expected value: $ExpectedToken" "Green"
            } else {
                Write-ColorOutput "✗ Token mismatch!" "Red"
                Write-ColorOutput "  Expected: $ExpectedToken" "Red"
                Write-ColorOutput "  Actual:   $tokenValue" "Red"
                throw "Token value does not match expected value"
            }
            Write-Host ""
        }

        # Success summary
        Write-ColorOutput "================================================" "Cyan"
        Write-ColorOutput "  Test Completed Successfully! ✓" "Green"
        Write-ColorOutput "================================================" "Cyan"
        Write-Host ""
        Write-ColorOutput "Summary:" "Cyan"
        Write-ColorOutput "  Function URL: $FunctionUrl" "White"
        Write-ColorOutput "  Status: Passed ✓" "Green"
        Write-ColorOutput "  Token: $tokenValue" "White"
        if ($response.message) {
            Write-ColorOutput "  Message: $($response.message)" "White"
        }
        Write-Host ""

        return $true

    } catch {
        Write-ColorOutput "" "Red"
        Write-ColorOutput "================================================" "Red"
        Write-ColorOutput "  TEST FAILED: $($_.Exception.Message)" "Red"
        Write-ColorOutput "================================================" "Red"
        Write-Host ""
        return $false
    }
}
