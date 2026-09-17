function Get-ZeppConfig {
    <#
    .SYNOPSIS
        Retrieves the saved Azure Function deployment configuration.

    .DESCRIPTION
        This cmdlet retrieves the deployment configuration that was previously saved using 
        Set-ZeppAzureFunction with the -SaveConfig parameter. The configuration includes:
        - ResourceGroupName
        - FunctionAppName
        - Location
        - AllowedIpAddress
        - StorageAccountName
        - DisableFunctionAuth

    .PARAMETER ConfigName
        Optional name for the configuration file. Default: zepp-azure-config

    .PARAMETER AsJson
        Returns the configuration as JSON string instead of PowerShell object.

    .EXAMPLE
        Get-ZeppConfig
        
        Retrieves the saved configuration as a PowerShell hashtable.

    .EXAMPLE
        Get-ZeppConfig -AsJson
        
        Retrieves the saved configuration as a JSON string.

    .EXAMPLE
        Get-ZeppConfig -ConfigName "my-custom-config"
        
        Retrieves configuration from a custom-named config file.

    .NOTES
        The configuration file is stored in the same directory as the script, or in the user's 
        home directory if the script directory is not available.
    #>

    [CmdletBinding()]
    param(
        [Parameter(Mandatory = $false)]
        [string]$ConfigName = "zepp-azure-config",

        [Parameter(Mandatory = $false)]
        [switch]$AsJson
    )

    # Set error action preference
    $ErrorActionPreference = "Stop"

    try {
        # Get config file path
        $configPath = Get-ConfigFilePath -ConfigName $ConfigName

        Write-ColorOutput "================================================" "Cyan"
        Write-ColorOutput "  Get Zepp Configuration" "Cyan"
        Write-ColorOutput "================================================" "Cyan"
        Write-Host ""

        # Check if config file exists
        if (-not (Test-Path $configPath)) {
            Write-ColorOutput "⚠ Configuration file not found: $configPath" "Yellow"
            Write-Host ""
            Write-ColorOutput "To create a configuration file, run:" "Cyan"
            Write-ColorOutput "  Set-ZeppAzureFunction -ResourceGroupName 'rg-zepp' -FunctionAppName 'func-zepp' -SaveConfig" "White"
            Write-Host ""
            return $null
        }

        # Load configuration
        Write-ColorOutput "Loading configuration from: $configPath" "Yellow"
        $config = LoadZeppConfigInternal -ConfigPath $configPath

        if ($null -eq $config) {
            throw "Failed to load configuration from file."
        }

        Write-Host ""
        Write-ColorOutput "================================================" "Cyan"
        Write-ColorOutput "  Configuration Retrieved Successfully ✓" "Green"
        Write-ColorOutput "================================================" "Cyan"
        Write-Host ""

        # Display configuration
        Write-ColorOutput "Configuration Details:" "Cyan"
        Write-ColorOutput "  Resource Group:       $($config.ResourceGroupName)" "White"
        Write-ColorOutput "  Function App:         $($config.FunctionAppName)" "White"
        Write-ColorOutput "  Location:             $($config.Location)" "White"
        Write-ColorOutput "  Allowed IP:           $($config.AllowedIpAddress)" "White"
        Write-ColorOutput "  Storage Account:      $($config.StorageAccountName)" "White"
        Write-ColorOutput "  Disable Function Auth: $($config.DisableFunctionAuth)" "White"
        Write-Host ""
        Write-ColorOutput "Configuration File: $configPath" "Cyan"
        Write-Host ""

        # Return as JSON if requested
        if ($AsJson) {
            return $config | ConvertTo-Json -Depth 10
        }

        return $config

    } catch {
        Write-ColorOutput "" "Red"
        Write-ColorOutput "================================================" "Red"
        Write-ColorOutput "  ERROR: $($_.Exception.Message)" "Red"
        Write-ColorOutput "================================================" "Red"
        Write-Host ""
        return $null
    }
}
