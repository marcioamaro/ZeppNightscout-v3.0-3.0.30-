# Helper functions for ZeppNightscout Azure deployment scripts

# Shared helper function for colored output
function Write-ColorOutput {
    param(
        [string]$Message,
        [string]$Color = "White"
    )
    Write-Host $Message -ForegroundColor $Color
}

# Helper function to get config file path
function Get-ConfigFilePath {
    param(
        [string]$ConfigName = "zepp-azure-config"
    )
    
    # Use script directory if available, otherwise use user's home directory
    $configDir = if ($PSScriptRoot) {
        $PSScriptRoot
    } elseif ($env:HOME) {
        # Unix/Linux/macOS
        $env:HOME
    } elseif ($env:USERPROFILE) {
        # Windows
        $env:USERPROFILE
    } else {
        # Fallback to current directory
        $PWD.Path
    }
    
    return Join-Path $configDir "$ConfigName.json"
}

# Internal helper function to save configuration
function SaveZeppConfigInternal {
    param(
        [hashtable]$Config,
        [string]$ConfigPath
    )
    
    try {
        $Config | ConvertTo-Json -Depth 10 | Set-Content -Path $ConfigPath -Encoding UTF8
        Write-ColorOutput "✓ Configuration saved to: $ConfigPath" "Green"
        return $true
    } catch {
        Write-ColorOutput "⚠ Failed to save configuration: $($_.Exception.Message)" "Yellow"
        return $false
    }
}

# Internal helper function to load configuration
function LoadZeppConfigInternal {
    param(
        [string]$ConfigPath
    )
    
    try {
        if (Test-Path $ConfigPath) {
            $config = Get-Content -Path $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
            Write-ColorOutput "✓ Configuration loaded from: $ConfigPath" "Green"
            
            # Convert PSCustomObject to hashtable for easier manipulation
            $hashtable = @{}
            $config.PSObject.Properties | ForEach-Object {
                $hashtable[$_.Name] = $_.Value
            }
            
            return $hashtable
        } else {
            Write-ColorOutput "⚠ Configuration file not found: $ConfigPath" "Yellow"
            return $null
        }
    } catch {
        Write-ColorOutput "⚠ Failed to load configuration: $($_.Exception.Message)" "Yellow"
        return $null
    }
}

# Helper function to validate IPv4 address
function Test-IPv4Address {
    param(
        [string]$IpAddress
    )
    
    if ([string]::IsNullOrWhiteSpace($IpAddress)) {
        return $false
    }
    
    # Check format and validate each octet
    if ($IpAddress -match '^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$') {
        $octets = $IpAddress.Split('.')
        foreach ($octet in $octets) {
            $num = [int]$octet
            if ($num -lt 0 -or $num -gt 255) {
                return $false
            }
        }
        return $true
    }
    
    return $false
}

# Helper function to ensure IP address is in CIDR format
function ConvertTo-CIDRFormat {
    param(
        [string]$IpAddress
    )
    
    if ([string]::IsNullOrWhiteSpace($IpAddress)) {
        return $IpAddress
    }
    
    # If already in CIDR format (IP/prefix), validate and return as-is
    # Check for IP address format followed by / and prefix length
    if ($IpAddress -match '^([0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3})/(\d{1,2})$') {
        $ip = $Matches[1]
        $prefix = [int]$Matches[2]
        
        # Validate prefix length is 0-32 for IPv4
        if ($prefix -ge 0 -and $prefix -le 32 -and (Test-IPv4Address -IpAddress $ip)) {
            return $IpAddress
        }
    }
    
    # If it's a plain IP address (without /), append /32
    if (Test-IPv4Address -IpAddress $IpAddress) {
        return "$IpAddress/32"
    }
    
    # Return as-is if it's not a valid IP (let Azure handle the error)
    return $IpAddress
}

# Helper function to validate storage account name
function Test-StorageAccountName {
    param(
        [string]$StorageAccountName
    )
    
    if ([string]::IsNullOrWhiteSpace($StorageAccountName)) {
        return $false
    }
    
    # Storage account name must be 3-24 characters, lowercase letters and numbers only
    return $StorageAccountName -match '^[a-z0-9]{3,24}$'
}

# Helper function to validate Function App name
function Test-FunctionAppName {
    param(
        [string]$FunctionAppName
    )
    
    if ([string]::IsNullOrWhiteSpace($FunctionAppName)) {
        return $false
    }
    
    # Function app name must contain only alphanumeric characters and hyphens
    return $FunctionAppName -match '^[a-zA-Z0-9\-]+$'
}
