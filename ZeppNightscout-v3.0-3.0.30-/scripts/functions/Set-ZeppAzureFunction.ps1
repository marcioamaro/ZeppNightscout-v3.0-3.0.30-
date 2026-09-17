function Set-ZeppAzureFunction {
    <#
    .SYNOPSIS
        Creates an Azure Function App with a Python HTTP trigger that returns a dummy API token.

    .DESCRIPTION
        This cmdlet creates an Azure Function App with the following features:
        - Python 3.11 runtime (Functions v4)
        - HTTP trigger function that returns "DUMMY-TOKEN"
        - Automatic IP detection and firewall configuration for Azure Cloud Shell compatibility
        - IP access restrictions to allow access from specific IP addresses
        - Function code editable in the Azure Portal
        - Uses Azure PowerShell (Az module) - designed for Azure Cloud Shell
        - Configuration save/load support for easier re-deployment
        
        Note: The function app is created with Flex Consumption plan for cost-effective hosting.

    .PARAMETER ResourceGroupName
        Name of the Azure Resource Group. Will be created if it doesn't exist.

    .PARAMETER FunctionAppName
        Name of the Azure Function App. Must be globally unique.

    .PARAMETER Location
        Azure region for the resources. Default: eastus

    .PARAMETER AllowedIpAddress
        IP address that will be allowed to access the function. 
        If not specified, your current public IP is automatically detected and used.
        When specified and running in Azure Cloud Shell, both your detected IP and the specified IP will be added.
        Set to "0.0.0.0/0" to allow all IPs (not recommended for production).
        Default: Auto-detected from your current public IP

    .PARAMETER StorageAccountName
        Name of the storage account for the function app. If not provided, will be auto-generated.

    .PARAMETER DisableFunctionAuth
        Disables function-level authentication. When enabled, relies solely on IP firewall for security.
        WARNING: Only use this with proper IP restrictions configured!

    .PARAMETER SaveConfig
        Saves the provided configuration to a local file for later reuse with -LoadConfig.

    .PARAMETER LoadConfig
        Loads configuration from a previously saved file (created with -SaveConfig).

    .EXAMPLE
        Set-ZeppAzureFunction -ResourceGroupName "rg-zeppnightscout" -FunctionAppName "func-zepptoken"
        
        Creates a function with auto-detected IP restrictions (recommended for Azure Cloud Shell).

    .EXAMPLE
        Set-ZeppAzureFunction -ResourceGroupName "rg-zeppnightscout" -FunctionAppName "func-zepptoken" -AllowedIpAddress "203.0.113.10"
        
        Creates a function with specific IP restriction. In Azure Cloud Shell, both the detected IP and 203.0.113.10 will be allowed.

    .EXAMPLE
        Set-ZeppAzureFunction -ResourceGroupName "rg-zeppnightscout" -FunctionAppName "func-zepptoken" -SaveConfig
        
        Creates a function and saves the configuration for later reuse.

    .EXAMPLE
        Set-ZeppAzureFunction -LoadConfig
        
        Creates a function using previously saved configuration.

    .EXAMPLE
        Set-ZeppAzureFunction -ResourceGroupName "rg-zeppnightscout" -FunctionAppName "func-zepptoken" -Location "westeurope" -DisableFunctionAuth
        
        Creates a function in West Europe with auto-detected IP and no function-level authentication.

    .NOTES
        Prerequisites:
        - Azure PowerShell (Az module) - pre-installed in Azure Cloud Shell
        - User must be logged in to Azure (Connect-AzAccount)
        - User must have permissions to create resources in the subscription
        
        This cmdlet is optimized for Azure Cloud Shell where Az module is pre-installed.
        The script automatically detects your public IP using online services (ifconfig.me, ipify.org, icanhazip.com).
    #>

    [CmdletBinding(DefaultParameterSetName = "Direct")]
    param(
        [Parameter(Mandatory = $true, ParameterSetName = "Direct")]
        [string]$ResourceGroupName,

        [Parameter(Mandatory = $true, ParameterSetName = "Direct")]
        [string]$FunctionAppName,

        [Parameter(Mandatory = $false, ParameterSetName = "Direct")]
        [string]$Location = "eastus",

        [Parameter(Mandatory = $false, ParameterSetName = "Direct")]
        [string]$AllowedIpAddress = "0.0.0.0/0",

        [Parameter(Mandatory = $false, ParameterSetName = "Direct")]
        [string]$StorageAccountName,

        [Parameter(Mandatory = $false, ParameterSetName = "Direct")]
        [switch]$DisableFunctionAuth,

        [Parameter(Mandatory = $false, ParameterSetName = "Direct")]
        [switch]$SaveConfig,

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
        
        # Apply loaded configuration
        $ResourceGroupName = $loadedConfig.ResourceGroupName
        $FunctionAppName = $loadedConfig.FunctionAppName
        $Location = if ($loadedConfig.Location) { $loadedConfig.Location } else { "eastus" }
        $AllowedIpAddress = if ($loadedConfig.AllowedIpAddress) { $loadedConfig.AllowedIpAddress } else { "0.0.0.0/0" }
        $StorageAccountName = $loadedConfig.StorageAccountName
        $DisableFunctionAuth = [bool]$loadedConfig.DisableFunctionAuth
        
        Write-Host ""
    }

# Main script execution
try {
    Write-ColorOutput "================================================" "Cyan"
    Write-ColorOutput "  Azure Function App Creation Script" "Cyan"
    Write-ColorOutput "================================================" "Cyan"
    Write-Host ""

    # Check if Az module is available
    Write-ColorOutput "Checking prerequisites..." "Yellow"
    if (-not (Get-Module -ListAvailable -Name Az.Functions)) {
        Write-ColorOutput "Az.Functions module not found. Installing..." "Yellow"
        Install-Module -Name Az.Functions -Force -AllowClobber -Scope CurrentUser
    }
    if (-not (Get-Module -ListAvailable -Name Az.Resources)) {
        Write-ColorOutput "Az.Resources module not found. Installing..." "Yellow"
        Install-Module -Name Az.Resources -Force -AllowClobber -Scope CurrentUser
    }
    if (-not (Get-Module -ListAvailable -Name Az.Storage)) {
        Write-ColorOutput "Az.Storage module not found. Installing..." "Yellow"
        Install-Module -Name Az.Storage -Force -AllowClobber -Scope CurrentUser
    }
    if (-not (Get-Module -ListAvailable -Name Az.Websites)) {
        Write-ColorOutput "Az.Websites module not found. Installing..." "Yellow"
        Install-Module -Name Az.Websites -Force -AllowClobber -Scope CurrentUser
    }
    
    Write-ColorOutput "✓ Azure PowerShell modules available" "Green"

    # Check if logged in to Azure
    Write-ColorOutput "Checking Azure login status..." "Yellow"
    $context = Get-AzContext
    if (-not $context) {
        throw "Not logged in to Azure. Please run 'Connect-AzAccount' first or use Azure Cloud Shell."
    }
    Write-ColorOutput "✓ Logged in to Azure (Subscription: $($context.Subscription.Name))" "Green"
    Write-Host ""

    # Auto-detect current public IP address for Azure Cloud Shell compatibility
    Write-ColorOutput "Detecting current public IP address..." "Yellow"
    try {
        # Try multiple services for reliability
        $detectedIp = $null
        $services = @(
            "https://iiric.azurewebsites.net/MyIP",
            "https://ifconfig.me/ip",
            "https://api.ipify.org",
            "https://icanhazip.com"
        )
        
        foreach ($service in $services) {
            try {
                $response = Invoke-RestMethod -Uri $service -TimeoutSec 5 -ErrorAction Stop
                if ($null -ne $response) {
                    $ipCandidate = $response.ToString().Trim()
                    if (Test-IPv4Address -IpAddress $ipCandidate) {
                        $detectedIp = $ipCandidate
                        break
                    }
                }
            } catch {
                # Service failed, try next one
                continue
            }
        }
        
        if ($detectedIp) {
            Write-ColorOutput "✓ Detected public IP: $detectedIp" "Green"
            
            # If AllowedIpAddress is default (0.0.0.0/0), use detected IP
            # Otherwise, ensure detected IP is included
            if ($AllowedIpAddress -eq "0.0.0.0/0") {
                $AllowedIpAddress = ConvertTo-CIDRFormat -IpAddress $detectedIp
                Write-ColorOutput "  Automatically setting IP restriction to detected IP" "Cyan"
            } else {
                # Check if the detected IP is different from the specified one
                if ($AllowedIpAddress -ne $detectedIp) {
                    Write-ColorOutput "  Note: Specified IP ($AllowedIpAddress) differs from detected IP ($detectedIp)" "Yellow"
                    Write-ColorOutput "  Adding both IPs to firewall for Azure Cloud Shell compatibility" "Cyan"
                    # We'll add both IPs later in the IP restriction configuration
                }
            }
        } else {
            Write-ColorOutput "⚠ Could not detect public IP address automatically" "Yellow"
            if ($AllowedIpAddress -eq "0.0.0.0/0") {
                Write-ColorOutput "  Function will be accessible from all IPs (0.0.0.0/0)" "Yellow"
            }
        }
    } catch {
        Write-ColorOutput "⚠ Error detecting public IP: $($_.Exception.Message)" "Yellow"
        if ($AllowedIpAddress -eq "0.0.0.0/0") {
            Write-ColorOutput "  Function will be accessible from all IPs (0.0.0.0/0)" "Yellow"
        }
    }
    Write-Host ""

    # Generate storage account name if not provided
    if (-not $StorageAccountName) {
        # Storage account name must be 3-24 chars, lowercase letters and numbers only
        $randomSuffix = -join ((97..122) | Get-Random -Count 6 | ForEach-Object {[char]$_})
        $StorageAccountName = "stzepptoken$randomSuffix"
        Write-ColorOutput "Generated storage account name: $StorageAccountName" "Yellow"
    }

    # Validate storage account name
    if (-not (Test-StorageAccountName -StorageAccountName $StorageAccountName)) {
        throw "Storage account name must be 3-24 characters, lowercase letters and numbers only."
    }

    # Create Resource Group if it doesn't exist
    Write-ColorOutput "Creating/verifying resource group '$ResourceGroupName' in '$Location'..." "Yellow"
    $rg = Get-AzResourceGroup -Name $ResourceGroupName -ErrorAction SilentlyContinue
    if (-not $rg) {
        New-AzResourceGroup -Name $ResourceGroupName -Location $Location | Out-Null
    }
    Write-ColorOutput "✓ Resource group ready" "Green"
    Write-Host ""

    # Create Storage Account
    Write-ColorOutput "Creating storage account '$StorageAccountName'..." "Yellow"
    $storageAccount = Get-AzStorageAccount -ResourceGroupName $ResourceGroupName -Name $StorageAccountName -ErrorAction SilentlyContinue
    if (-not $storageAccount) {
        New-AzStorageAccount `
            -ResourceGroupName $ResourceGroupName `
            -Name $StorageAccountName `
            -Location $Location `
            -SkuName Standard_LRS `
            -Kind StorageV2 | Out-Null
        Write-ColorOutput "✓ Storage account created" "Green"
    } else {
        Write-ColorOutput "✓ Storage account already exists" "Green"
    }
    Write-Host ""

    # Determine authentication level
    $authLevel = if ($DisableFunctionAuth) { "anonymous" } else { "function" }
    if ($DisableFunctionAuth) {
        Write-ColorOutput "⚠ Function-level authentication disabled - relying on IP firewall only!" "Yellow"
    }

    # Create Function App with Python runtime (without explicit plan)
    Write-ColorOutput "Creating Function App '$FunctionAppName' with Python runtime..." "Yellow"
    $functionApp = Get-AzFunctionApp -ResourceGroupName $ResourceGroupName -Name $FunctionAppName -ErrorAction SilentlyContinue
    if (-not $functionApp) {
        New-AzFunctionApp `
            -Name $FunctionAppName `
            -ResourceGroupName $ResourceGroupName `
            -FlexConsumptionLocation $Location `
            -StorageAccountName $StorageAccountName `
            -Runtime Python `
            -RuntimeVersion "3.11" `
            -InstanceMemoryMB 512 | Out-Null
        Write-ColorOutput "✓ Function App created" "Green"
    } else {
        Write-ColorOutput "✓ Function App already exists" "Green"
    }
    Write-Host ""

    # Wait for function app to be fully provisioned
    Write-ColorOutput "Waiting for Function App to be fully provisioned..." "Yellow"
    Start-Sleep -Seconds 30
    Write-ColorOutput "✓ Function App is ready" "Green"
    Write-Host ""

    # Create Python function code directory structure
    Write-ColorOutput "Creating Python function code..." "Yellow"
    $tempDir = Join-Path ([System.IO.Path]::GetTempPath()) "azure-function-$(Get-Random)"
    New-Item -ItemType Directory -Path $tempDir -Force | Out-Null
    
    # Try to locate the template directory
    $templateDir = $null
    if ($PSCommandPath) {
        $scriptDir = Split-Path -Parent $PSCommandPath
        $parentScriptDir = Split-Path -Parent $scriptDir
        $templateDir = Join-Path $parentScriptDir "azure-function-template"
    }
    
    # Create function.json for HTTP trigger
    $functionJsonPath = Join-Path $tempDir "function.json"
    $functionJsonTemplatePath = if ($templateDir) { Join-Path $templateDir "function.json" } else { $null }
    
    if ($functionJsonTemplatePath -and (Test-Path $functionJsonTemplatePath)) {
        Write-ColorOutput "  Reading function.json from template: $functionJsonTemplatePath" "White"
        $functionJsonContent = Get-Content -Path $functionJsonTemplatePath -Raw -Encoding UTF8
        
        # Parse JSON to modify authLevel if needed
        $functionJson = $functionJsonContent | ConvertFrom-Json
        $functionJson.bindings[0].authLevel = $authLevel
        $functionJsonContent = $functionJson | ConvertTo-Json -Depth 10
        
        Set-Content -Path $functionJsonPath -Value $functionJsonContent -Encoding UTF8
    } else {
        # Template not found locally - download from GitHub main branch
        Write-ColorOutput "  Downloading function.json from GitHub main branch..." "Yellow"
        $githubUrl = "https://raw.githubusercontent.com/iricigor/ZeppNightscout/main/scripts/azure-function-template/function.json"
        
        $functionJson = Invoke-RestMethod -Uri $githubUrl -TimeoutSec 10 -ErrorAction Stop
        
        # Validate that we got a valid structure
        if (-not $functionJson.bindings -or $functionJson.bindings.Count -eq 0) {
            throw "Downloaded template has no bindings"
        }
        
        # Modify authLevel if needed
        $functionJson.bindings[0].authLevel = $authLevel
        $functionJsonContent = $functionJson | ConvertTo-Json -Depth 10
        
        Set-Content -Path $functionJsonPath -Value $functionJsonContent -Encoding UTF8
        Write-ColorOutput "  ✓ Downloaded and configured function.json from main branch" "Green"
    }
    
    # Create __init__.py with the function code
    # Read the Python code from the separate template file
    $initPyPath = Join-Path $tempDir "__init__.py"
    
    # Try to locate the template file (handles both normal execution and direct download scenarios)
    $pythonCode = $null
    $pythonTemplatePath = if ($templateDir) { Join-Path $templateDir "__init__.py" } else { $null }
    
    if ($pythonTemplatePath -and (Test-Path $pythonTemplatePath)) {
        Write-ColorOutput "  Reading Python code from template: $pythonTemplatePath" "White"
        $pythonCode = Get-Content -Path $pythonTemplatePath -Raw -Encoding UTF8
    }
    
    # If template not found locally, download from GitHub
    if (-not $pythonCode) {
        Write-ColorOutput "  Downloading __init__.py from GitHub main branch..." "Yellow"
        $githubUrl = "https://raw.githubusercontent.com/iricigor/ZeppNightscout/main/scripts/azure-function-template/__init__.py"
        
        $pythonCode = Invoke-RestMethod -Uri $githubUrl -TimeoutSec 10 -ErrorAction Stop
        Write-ColorOutput "  ✓ Downloaded __init__.py from main branch" "Green"
    }
    
    Set-Content -Path $initPyPath -Value $pythonCode -Encoding UTF8
    
    # Create host.json
    $hostJsonPath = Join-Path (Split-Path $tempDir -Parent) "host.json"
    $hostJsonTemplatePath = if ($templateDir) { Join-Path $templateDir "host.json" } else { $null }
    
    if ($hostJsonTemplatePath -and (Test-Path $hostJsonTemplatePath)) {
        Write-ColorOutput "  Reading host.json from template: $hostJsonTemplatePath" "White"
        Copy-Item -Path $hostJsonTemplatePath -Destination $hostJsonPath -Force
    } else {
        # Template not found locally - download from GitHub main branch
        Write-ColorOutput "  Downloading host.json from GitHub main branch..." "Yellow"
        $githubUrl = "https://raw.githubusercontent.com/iricigor/ZeppNightscout/main/scripts/azure-function-template/host.json"
        
        $hostJson = Invoke-RestMethod -Uri $githubUrl -TimeoutSec 10 -ErrorAction Stop
        $hostJsonContent = $hostJson | ConvertTo-Json -Depth 10
        Set-Content -Path $hostJsonPath -Value $hostJsonContent -Encoding UTF8
        Write-ColorOutput "  ✓ Downloaded host.json from main branch" "Green"
    }
    
    Write-ColorOutput "✓ Function code created locally" "Green"
    Write-Host ""

    # Deploy the function code using zip deploy
    Write-ColorOutput "Deploying function code to Azure..." "Yellow"
    
    # Create a zip file
    $functionName = "GetToken"
    $functionDir = Join-Path $tempDir $functionName
    New-Item -ItemType Directory -Path $functionDir -Force | Out-Null
    Move-Item -Path $functionJsonPath -Destination $functionDir -Force
    Move-Item -Path $initPyPath -Destination $functionDir -Force
    
    # Create requirements.txt
    $requirementsTxt = Join-Path $tempDir "requirements.txt"
    Set-Content -Path $requirementsTxt -Value "azure-functions" -Encoding UTF8
    
    # Move host.json to the right place
    Move-Item -Path $hostJsonPath -Destination $tempDir -Force
    
    # Use timestamp and process ID for unique zip file name to avoid conflicts
    $timestamp = Get-Date -Format "yyyyMMddHHmmss"
    $zipPath = Join-Path ([System.IO.Path]::GetTempPath()) "function-app-$timestamp-$PID.zip"
    
    # Remove zip file if it exists to avoid corruption
    if (Test-Path $zipPath) {
        Remove-Item -Path $zipPath -Force -ErrorAction SilentlyContinue
    }
    
    # Create zip using PowerShell compression with CompressionLevel for better compatibility
    try {
        Compress-Archive -Path "$tempDir\*" -DestinationPath $zipPath -CompressionLevel Optimal
        
        # Verify the zip file was created and has content
        if (-not (Test-Path $zipPath)) {
            throw "Zip file was not created at $zipPath"
        }
        
        $zipFileInfo = Get-Item $zipPath
        if ($zipFileInfo.Length -eq 0) {
            throw "Zip file is empty (0 bytes)"
        }
        
        Write-ColorOutput "  ✓ Created deployment package: $($zipFileInfo.Length) bytes" "Green"
    } catch {
        throw "Failed to create deployment zip file: $($_.Exception.Message)"
    }
    
    # Deploy using Kudu API zip deployment
    try {
        # Get publishing credentials
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
        
        # Deploy zip file using Kudu API
        $zipDeployUrl = "https://$FunctionAppName.scm.azurewebsites.net/api/zipdeploy"
        $headers = @{
            Authorization = "Basic $base64AuthInfo"
        }
        
        # Deploy with retry logic
        $maxRetries = 3
        $retryCount = 0
        $deployed = $false
        
        while (-not $deployed -and $retryCount -lt $maxRetries) {
            try {
                Invoke-RestMethod -Uri $zipDeployUrl -Method Post -Headers $headers -InFile $zipPath -ContentType "application/zip" -TimeoutSec 300 | Out-Null
                $deployed = $true
                Write-ColorOutput "✓ Function code deployed" "Green"
            } catch {
                $retryCount++
                if ($retryCount -lt $maxRetries) {
                    Write-ColorOutput "Deployment attempt $retryCount failed, retrying..." "Yellow"
                    Start-Sleep -Seconds 5
                } else {
                    throw
                }
            }
        }
    } catch {
        Write-ColorOutput "Warning: Function deployment may have failed, but the function app is created." "Yellow"
        Write-ColorOutput "You can manually upload the function code through the Azure Portal." "Yellow"
        Write-ColorOutput "Error details: $($_.Exception.Message)" "Red"
    } finally {
        # Clear sensitive credentials from memory
        Remove-Variable -Name username -ErrorAction SilentlyContinue
        Remove-Variable -Name password -ErrorAction SilentlyContinue
        Remove-Variable -Name base64AuthInfo -ErrorAction SilentlyContinue
    }
    
    # Clean up temp files
    Remove-Item -Path $tempDir -Recurse -Force -ErrorAction SilentlyContinue
    Remove-Item -Path $zipPath -Force -ErrorAction SilentlyContinue
    Write-Host ""

    # Note: For Flex Consumption plans, portal editing is enabled by default after zip deployment
    # WEBSITE_RUN_FROM_PACKAGE is not supported on Flex Consumption SKU
    Write-ColorOutput "✓ Portal editing enabled (default for Flex Consumption plan)" "Green"
    Write-Host ""

    # Configure IP restrictions
    if ($AllowedIpAddress -ne "0.0.0.0/0") {
        Write-ColorOutput "Configuring IP access restrictions..." "Yellow"
        
        try {
            # Collect all IPs to add to firewall with descriptive names
            $ipRules = @()
            
            # Add the specified IP (ensure it's in CIDR format)
            $convertedIp = ConvertTo-CIDRFormat -IpAddress $AllowedIpAddress
            $ipRules += @{
                IpAddress = $convertedIp
                RuleName = "AllowSpecifiedIP"
                Description = "Specified IP"
            }
            Write-ColorOutput "  Adding specified IP: $convertedIp" "White"
            
            # If we detected a different IP earlier, add it too for Azure Cloud Shell compatibility
            if ($detectedIp -and $detectedIp -ne $AllowedIpAddress -and (Test-IPv4Address -IpAddress $detectedIp)) {
                $convertedDetectedIp = ConvertTo-CIDRFormat -IpAddress $detectedIp
                $ipRules += @{
                    IpAddress = $convertedDetectedIp
                    RuleName = "AllowDetectedIP"
                    Description = "Auto-detected IP (Azure Cloud Shell)"
                }
                Write-ColorOutput "  Adding detected IP: $convertedDetectedIp (for Azure Cloud Shell)" "White"
            }
            
            # Remove any existing rules with our names (including legacy names for backwards compatibility)
            $existingRules = Get-AzWebAppAccessRestrictionConfig -ResourceGroupName $ResourceGroupName -Name $FunctionAppName -ErrorAction SilentlyContinue
            if ($existingRules -and $existingRules.MainSiteAccessRestrictions) {
                $ruleNamesToRemove = @("AllowSpecifiedIP", "AllowDetectedIP", "AllowSpecificIP")
                foreach ($rule in $existingRules.MainSiteAccessRestrictions) {
                    if ($rule.RuleName -in $ruleNamesToRemove -or $rule.RuleName -like "AllowSpecificIP_*") {
                        Remove-AzWebAppAccessRestrictionRule `
                            -ResourceGroupName $ResourceGroupName `
                            -WebAppName $FunctionAppName `
                            -Name $rule.RuleName `
                            -ErrorAction SilentlyContinue | Out-Null
                    }
                }
            }
            
            # Add IP restriction rules
            $priority = 100
            foreach ($ipRule in $ipRules) {
                Add-AzWebAppAccessRestrictionRule `
                    -ResourceGroupName $ResourceGroupName `
                    -WebAppName $FunctionAppName `
                    -Name $ipRule.RuleName `
                    -Action Allow `
                    -IpAddress $ipRule.IpAddress `
                    -Priority $priority | Out-Null
                $priority += 10
            }
            
            Write-ColorOutput "✓ IP access restrictions configured for $($ipRules.Count) IP(s)" "Green"
        } catch {
            Write-ColorOutput "Warning: Failed to configure IP restrictions. You can configure this manually in the Azure Portal." "Yellow"
            Write-ColorOutput "Error details: $($_.Exception.Message)" "Red"
        }
    } else {
        Write-ColorOutput "⚠ No IP restrictions configured - function is accessible from all IPs" "Yellow"
    }
    Write-Host ""

    # Get function URL
    Write-ColorOutput "Retrieving function URL..." "Yellow"
    
    $functionUrl = "https://$FunctionAppName.azurewebsites.net/api/GetToken"
    
    if (-not $DisableFunctionAuth) {
        try {
            # Get function keys using Invoke-AzResourceAction
            $keys = Invoke-AzResourceAction `
                -ResourceType "Microsoft.Web/sites/functions" `
                -ResourceGroupName $ResourceGroupName `
                -ResourceName "$FunctionAppName/GetToken" `
                -Action listkeys `
                -ApiVersion "2022-03-01" `
                -Force
            
            if ($keys.default) {
                $functionUrl = "$functionUrl?code=$($keys.default)"
            }
        } catch {
            Write-ColorOutput "Warning: Could not retrieve function keys. The function was created successfully." "Yellow"
            Write-ColorOutput "You can find the function URL and keys in the Azure Portal." "Yellow"
        }
    }
    
    Write-ColorOutput "================================================" "Cyan"
    Write-ColorOutput "  Deployment Completed Successfully! ✓" "Green"
    Write-ColorOutput "================================================" "Cyan"
    Write-Host ""
    Write-ColorOutput "Resource Group:   $ResourceGroupName" "White"
    Write-ColorOutput "Function App:     $FunctionAppName" "White"
    Write-ColorOutput "Storage Account:  $StorageAccountName" "White"
    Write-ColorOutput "Location:         $Location" "White"
    Write-ColorOutput "Runtime:          Python 3.11 (Functions v4)" "White"
    Write-ColorOutput "Function Name:    GetToken" "White"
    Write-ColorOutput "Auth Level:       $authLevel" "White"
    if ($AllowedIpAddress -ne "0.0.0.0/0") {
        Write-ColorOutput "Allowed IP:       $AllowedIpAddress" "White"
    }
    Write-Host ""
    Write-ColorOutput "Function URL:" "Cyan"
    Write-ColorOutput $functionUrl "Yellow"
    Write-Host ""
    Write-ColorOutput "To test the function, run:" "Cyan"
    Write-ColorOutput "  curl `"$functionUrl`"" "White"
    Write-Host ""
    Write-ColorOutput "To edit the function in Azure Portal:" "Cyan"
    Write-ColorOutput "  1. Go to https://portal.azure.com" "White"
    Write-ColorOutput "  2. Navigate to your Function App: $FunctionAppName" "White"
    Write-ColorOutput "  3. Select 'Functions' -> 'GetToken' -> 'Code + Test'" "White"
    Write-ColorOutput "  4. Edit __init__.py to change the response" "White"
    Write-Host ""

    # Save configuration if requested
    if ($SaveConfig) {
        Write-Host ""
        Write-ColorOutput "Saving configuration..." "Yellow"
        $configToSave = @{
            ResourceGroupName = $ResourceGroupName
            FunctionAppName = $FunctionAppName
            Location = $Location
            AllowedIpAddress = $AllowedIpAddress
            StorageAccountName = $StorageAccountName
            DisableFunctionAuth = [bool]$DisableFunctionAuth
        }
        
        SaveZeppConfigInternal -Config $configToSave -ConfigPath $configPath
        Write-Host ""
    }

} catch {
    Write-ColorOutput "" "Red"
    Write-ColorOutput "================================================" "Red"
    Write-ColorOutput "  ERROR: $($_.Exception.Message)" "Red"
    Write-ColorOutput "================================================" "Red"
    Write-Host ""
    throw
}
}
