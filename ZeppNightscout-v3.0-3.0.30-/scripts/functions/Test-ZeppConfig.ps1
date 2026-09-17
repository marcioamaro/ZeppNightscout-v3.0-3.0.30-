function Test-ZeppConfig {
    <#
    .SYNOPSIS
        Validates the saved Azure Function deployment configuration.

    .DESCRIPTION
        This cmdlet validates the deployment configuration that was previously saved using 
        Set-ZeppAzureFunction with the -SaveConfig parameter. It performs validation on:
        - Configuration file existence and readability
        - Required fields presence (ResourceGroupName, FunctionAppName)
        - IP address format validation
        - Storage account name format validation
        - Field value constraints and best practices

    .PARAMETER ConfigName
        Optional name for the configuration file. Default: zepp-azure-config

    .PARAMETER Detailed
        Shows detailed validation results for each field.

    .EXAMPLE
        Test-ZeppConfig
        
        Validates the saved configuration and returns true/false.

    .EXAMPLE
        Test-ZeppConfig -Detailed
        
        Validates the configuration with detailed output for each check.

    .EXAMPLE
        Test-ZeppConfig -ConfigName "my-custom-config"
        
        Validates a custom-named configuration file.

    .NOTES
        This function is useful for verifying configuration before deployment and 
        troubleshooting configuration issues.
    #>

    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $false)]
        [string]$ConfigName = "zepp-azure-config",

        [Parameter(Mandatory = $false)]
        [switch]$Detailed
    )

    # Set error action preference
    $ErrorActionPreference = "Stop"

    try {
        # Get config file path
        $configPath = Get-ConfigFilePath -ConfigName $ConfigName

        Write-ColorOutput "================================================" "Cyan"
        Write-ColorOutput "  Test Zepp Configuration" "Cyan"
        Write-ColorOutput "================================================" "Cyan"
        Write-Host ""

        $validationPassed = $true
        $issues = @()

        # Check 1: Configuration file exists
        Write-ColorOutput "Checking configuration file existence..." "Yellow"
        if (-not (Test-Path $configPath)) {
            Write-ColorOutput "✗ Configuration file not found: $configPath" "Red"
            $validationPassed = $false
            $issues += "Configuration file does not exist"
            
            Write-Host ""
            Write-ColorOutput "To create a configuration file, run:" "Cyan"
            Write-ColorOutput "  Set-ZeppAzureFunction -ResourceGroupName 'rg-zepp' -FunctionAppName 'func-zepp' -SaveConfig" "White"
            Write-Host ""
            return $false
        }
        Write-ColorOutput "✓ Configuration file exists" "Green"
        if ($Detailed) {
            Write-ColorOutput "  Path: $configPath" "White"
        }
        Write-Host ""

        # Check 2: Configuration file is readable
        Write-ColorOutput "Loading configuration..." "Yellow"
        $config = $null
        try {
            $config = LoadZeppConfigInternal -ConfigPath $configPath
            if ($null -eq $config) {
                throw "Configuration loaded as null"
            }
            Write-ColorOutput "✓ Configuration file is readable" "Green"
        } catch {
            Write-ColorOutput "✗ Failed to load configuration: $($_.Exception.Message)" "Red"
            $validationPassed = $false
            $issues += "Configuration file is not readable or contains invalid JSON"
            Write-Host ""
            return $false
        }
        Write-Host ""

        # Check 3: Required fields
        Write-ColorOutput "Validating required fields..." "Yellow"
        
        # Check ResourceGroupName
        if ([string]::IsNullOrWhiteSpace($config.ResourceGroupName)) {
            Write-ColorOutput "✗ ResourceGroupName is missing or empty" "Red"
            $validationPassed = $false
            $issues += "ResourceGroupName is required"
        } else {
            Write-ColorOutput "✓ ResourceGroupName is present" "Green"
            if ($Detailed) {
                Write-ColorOutput "  Value: $($config.ResourceGroupName)" "White"
            }
        }

        # Check FunctionAppName
        if ([string]::IsNullOrWhiteSpace($config.FunctionAppName)) {
            Write-ColorOutput "✗ FunctionAppName is missing or empty" "Red"
            $validationPassed = $false
            $issues += "FunctionAppName is required"
        } else {
            Write-ColorOutput "✓ FunctionAppName is present" "Green"
            if ($Detailed) {
                Write-ColorOutput "  Value: $($config.FunctionAppName)" "White"
            }
        }
        Write-Host ""

        # Check 4: Optional fields validation
        Write-ColorOutput "Validating optional fields..." "Yellow"

        # Check Location
        if ([string]::IsNullOrWhiteSpace($config.Location)) {
            Write-ColorOutput "⚠ Location is not set (will default to 'eastus')" "Yellow"
            if ($Detailed) {
                Write-ColorOutput "  Recommendation: Set a specific Azure region" "White"
            }
        } else {
            Write-ColorOutput "✓ Location is set" "Green"
            if ($Detailed) {
                Write-ColorOutput "  Value: $($config.Location)" "White"
            }
        }

        # Check AllowedIpAddress format
        if ([string]::IsNullOrWhiteSpace($config.AllowedIpAddress)) {
            Write-ColorOutput "⚠ AllowedIpAddress is not set (will allow all IPs: 0.0.0.0/0)" "Yellow"
            if ($Detailed) {
                Write-ColorOutput "  Recommendation: Set a specific IP address for better security" "White"
            }
        } else {
            # Validate IP format
            $ipToValidate = $config.AllowedIpAddress
            # Remove CIDR notation for validation
            if ($ipToValidate -match '^([0-9.]+)/\d+$') {
                $ipToValidate = $Matches[1]
            }
            
            if ($config.AllowedIpAddress -eq "0.0.0.0/0") {
                Write-ColorOutput "⚠ AllowedIpAddress allows all IPs (0.0.0.0/0)" "Yellow"
                if ($Detailed) {
                    Write-ColorOutput "  Warning: This is not secure for production" "Yellow"
                }
            } elseif (Test-IPv4Address -IpAddress $ipToValidate) {
                Write-ColorOutput "✓ AllowedIpAddress format is valid" "Green"
                if ($Detailed) {
                    Write-ColorOutput "  Value: $($config.AllowedIpAddress)" "White"
                }
            } else {
                Write-ColorOutput "✗ AllowedIpAddress format is invalid" "Red"
                $validationPassed = $false
                $issues += "AllowedIpAddress must be a valid IPv4 address or CIDR notation"
                if ($Detailed) {
                    Write-ColorOutput "  Value: $($config.AllowedIpAddress)" "White"
                }
            }
        }

        # Check StorageAccountName format
        if ([string]::IsNullOrWhiteSpace($config.StorageAccountName)) {
            Write-ColorOutput "⚠ StorageAccountName is not set (will be auto-generated)" "Yellow"
        } else {
            if (Test-StorageAccountName -StorageAccountName $config.StorageAccountName) {
                Write-ColorOutput "✓ StorageAccountName format is valid" "Green"
                if ($Detailed) {
                    Write-ColorOutput "  Value: $($config.StorageAccountName)" "White"
                }
            } else {
                Write-ColorOutput "✗ StorageAccountName format is invalid" "Red"
                $validationPassed = $false
                $issues += "StorageAccountName must be 3-24 characters, lowercase letters and numbers only"
                if ($Detailed) {
                    Write-ColorOutput "  Value: $($config.StorageAccountName)" "White"
                    Write-ColorOutput "  Expected: 3-24 lowercase alphanumeric characters" "White"
                }
            }
        }

        # Check DisableFunctionAuth
        if ($config.PSObject.Properties.Name -contains "DisableFunctionAuth") {
            $authValue = [bool]$config.DisableFunctionAuth
            Write-ColorOutput "✓ DisableFunctionAuth is set" "Green"
            if ($Detailed) {
                Write-ColorOutput "  Value: $authValue" "White"
                if ($authValue) {
                    Write-ColorOutput "  Note: Function will rely only on IP firewall for security" "Yellow"
                }
            }
        } else {
            Write-ColorOutput "✓ DisableFunctionAuth not set (will default to false)" "Green"
            if ($Detailed) {
                Write-ColorOutput "  Default: Function-level authentication enabled" "White"
            }
        }
        Write-Host ""

        # Summary
        Write-ColorOutput "================================================" "Cyan"
        if ($validationPassed) {
            Write-ColorOutput "  Configuration Validation Passed ✓" "Green"
        } else {
            Write-ColorOutput "  Configuration Validation Failed ✗" "Red"
        }
        Write-ColorOutput "================================================" "Cyan"
        Write-Host ""

        if ($validationPassed) {
            Write-ColorOutput "Summary:" "Cyan"
            Write-ColorOutput "  Configuration file: $configPath" "White"
            Write-ColorOutput "  Status: Valid ✓" "Green"
            Write-ColorOutput "  Resource Group: $($config.ResourceGroupName)" "White"
            Write-ColorOutput "  Function App: $($config.FunctionAppName)" "White"
            Write-Host ""
            Write-ColorOutput "Configuration is ready for deployment with:" "Cyan"
            Write-ColorOutput "  Set-ZeppAzureFunction -LoadConfig" "White"
            Write-Host ""
        } else {
            Write-ColorOutput "Issues found:" "Red"
            foreach ($issue in $issues) {
                Write-ColorOutput "  • $issue" "Red"
            }
            Write-Host ""
            Write-ColorOutput "Please fix these issues before deploying." "Yellow"
            Write-Host ""
        }

        return $validationPassed

    } catch {
        Write-ColorOutput "" "Red"
        Write-ColorOutput "================================================" "Red"
        Write-ColorOutput "  ERROR: $($_.Exception.Message)" "Red"
        Write-ColorOutput "================================================" "Red"
        Write-Host ""
        return $false
    }
}
