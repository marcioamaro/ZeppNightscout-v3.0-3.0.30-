# Azure Function Creation Script

This PowerShell script provides cmdlets to create and test an Azure Function that provides a dummy API token for the ZeppNightscout application.

## Table of Contents

- [Overview](#overview)
- [Quick Start](#quick-start)
  - [Method 1: Direct Download and Execute](#method-1-direct-download-and-execute-recommended-for-azure-cloud-shell)
  - [Method 2: Clone Repository](#method-2-clone-repository)
- [Prerequisites](#prerequisites)
- [Usage](#usage)
  - [Creating Azure Function](#creating-azure-function)
  - [Testing Azure Function](#testing-azure-function)
  - [Managing Configuration Files](#managing-configuration-files)
- [What the Script Does](#what-the-script-does)
- [Function Response](#function-response)
- [Testing the Function](#testing-the-function)
  - [Using Test-ZeppAzureFunction Cmdlet](#using-test-zeppazurefunction-cmdlet)
  - [Using curl](#using-curl)
  - [Using PowerShell](#using-powershell)
  - [Using a Web Browser](#using-a-web-browser)
- [Editing the Function](#editing-the-function)
- [Debugging and Monitoring](#debugging-and-monitoring)
- [Security Considerations](#security-considerations)
- [Costs](#costs)
- [Troubleshooting](#troubleshooting)
- [Cleanup](#cleanup)
- [Integration with ZeppNightscout](#integration-with-zeppnightscout)
- [Additional Resources](#additional-resources)
- [Support](#support)

## Overview

The `create-azure-function.ps1` script provides five cmdlets:

1. **`Set-ZeppAzureFunction`** - Automates the creation of:
   - Azure Resource Group
   - Azure Storage Account
   - Azure Function App (Python 3.11 runtime on Flex Consumption plan)
   - HTTP-triggered Python function that returns "DUMMY-TOKEN"
   - IP access restrictions for security
   - Configuration save/load support with `-SaveConfig` and `-LoadConfig`
   - **Portal editing enabled** - function code can be edited directly in Azure Portal

2. **`Test-ZeppAzureFunction`** - Tests a deployed Azure Function to:
   - Verify HTTP connectivity
   - Validate JSON response format
   - Confirm proper token payload is returned
   - Supports `-LoadConfig` to automatically test using saved configuration

3. **`Update-ZeppAzureToken`** - Securely updates the API token from command line:
   - Prompts for secure token input (hidden entry)
   - Updates token without needing portal access
   - Supports `-LoadConfig` for easy configuration management
   - Ideal for updating the Nightscout API token after deployment

4. **`Get-ZeppConfig`** - Retrieves saved deployment configuration:
   - Displays all saved configuration parameters
   - Supports JSON output with `-AsJson`
   - Helps verify configuration before deployment

5. **`Test-ZeppConfig`** - Validates saved deployment configuration:
   - Checks required fields (ResourceGroupName, FunctionAppName)
   - Validates IP address and storage account name formats
   - Provides detailed validation output with `-Detailed`

**This script is designed for Azure Cloud Shell** where Azure PowerShell (Az module) is pre-installed and pre-authenticated.

## Quick Start

### Method 1: Direct Download and Execute (Recommended for Azure Cloud Shell)

Open Azure Cloud Shell (PowerShell mode) and run:

```powershell
# Download and load the cmdlets
iex (irm https://raw.githubusercontent.com/iricigor/ZeppNightscout/main/scripts/create-azure-function.ps1)

# Create the Azure Function and save configuration (will auto-detect your IP address)
Set-ZeppAzureFunction -ResourceGroupName "rg-zeppnightscout" -FunctionAppName "func-zepptoken-unique123" -SaveConfig

# Update the token to your actual Nightscout token (secure prompt)
Update-ZeppAzureToken -LoadConfig

# Test the Azure Function using saved configuration
Test-ZeppAzureFunction -LoadConfig
```

**Using `-SaveConfig` and `-LoadConfig`:**
- `-SaveConfig`: Saves deployment parameters to a local config file for reuse
- `-LoadConfig`: Loads parameters from the saved config file, making management easy

This will:
1. Download the script from GitHub
2. Load the cmdlets into your session
3. Auto-detect your current public IP address and configure firewall rules
4. Deploy the Azure Function with portal editing enabled
5. Prompt you to securely enter your Nightscout API token
6. Test the function to verify it's working correctly

### Method 2: Clone Repository

1. Go to [Azure Portal](https://portal.azure.com)
2. Click the Cloud Shell icon (>_) in the top navigation bar
3. Select **PowerShell** if prompted
4. Clone the repository:
   ```powershell
   git clone https://github.com/iricigor/ZeppNightscout.git
   cd ZeppNightscout
   ```
5. Load the cmdlet:
   ```powershell
   . ./scripts/create-azure-function.ps1
   ```
6. Run the cmdlet:
   ```powershell
   Set-ZeppAzureFunction -ResourceGroupName "rg-zeppnightscout" -FunctionAppName "func-zepptoken-unique123" -AllowedIpAddress "203.0.113.10"
   ```

## Prerequisites

### Recommended: Azure Cloud Shell (No Installation Required!)

The easiest way to run this script is through Azure Cloud Shell - no installation or authentication needed!

### Alternative: Local PowerShell

If running locally, you need:

1. **PowerShell** 7+ installed
   - Download from: https://github.com/PowerShell/PowerShell

2. **Azure PowerShell (Az module)**
   - Install with: `Install-Module -Name Az -AllowClobber -Scope CurrentUser`
   - Documentation: https://learn.microsoft.com/powershell/azure/

3. **Azure Subscription**
   - Active Azure subscription with permissions to create resources
   - Log in with: `Connect-AzAccount`

## Usage

### Creating Azure Function

#### Basic Usage

```powershell
Set-ZeppAzureFunction `
    -ResourceGroupName "rg-zeppnightscout" `
    -FunctionAppName "func-zepptoken-unique123" `
    -AllowedIpAddress "203.0.113.10"
```

#### Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `ResourceGroupName` | Yes | - | Name of the Azure Resource Group (will be created if it doesn't exist) |
| `FunctionAppName` | Yes | - | Name of the Function App (must be globally unique) |
| `Location` | No | `eastus` | Azure region for resources (e.g., `eastus`, `westeurope`, `southeastasia`) |
| `AllowedIpAddress` | No | Auto-detected | IP address allowed to access the function. If not specified, your current public IP is auto-detected and used. Set to `0.0.0.0/0` to allow all IPs (not recommended) |
| `StorageAccountName` | No | Auto-generated | Storage account name (3-24 lowercase alphanumeric chars) |
| `DisableFunctionAuth` | No | `false` | Switch to disable function-level authentication (relies only on IP firewall) |
| `SaveConfig` | No | `false` | Switch to save deployment configuration to a local file for reuse with `-LoadConfig` |
| `LoadConfig` | No | `false` | Switch to load configuration from a previously saved file (created with `-SaveConfig`) |

**Note:** When running in Azure Cloud Shell, the script automatically detects your public IP address and adds it to the firewall. If you specify a different IP with `-AllowedIpAddress`, both IPs will be added to ensure the function works from both your specified IP and Azure Cloud Shell.

### Examples

#### Create function with auto-detected IP restriction (Recommended)

```powershell
Set-ZeppAzureFunction `
    -ResourceGroupName "rg-zeppnightscout" `
    -FunctionAppName "func-zepptoken-prod"
```

This will automatically detect your current public IP and configure the firewall accordingly.

#### Create function with specific IP restriction

```powershell
Set-ZeppAzureFunction `
    -ResourceGroupName "rg-zeppnightscout" `
    -FunctionAppName "func-zepptoken-prod" `
    -AllowedIpAddress "198.51.100.42"
```

**Note:** When running in Azure Cloud Shell, both your detected IP and the specified IP will be added to the firewall.

#### Create function in a different region

```powershell
Set-ZeppAzureFunction `
    -ResourceGroupName "rg-zeppnightscout-eu" `
    -FunctionAppName "func-zepptoken-eu" `
    -Location "westeurope"
```

#### Create function with IP restriction only (no function-level auth)

```powershell
Set-ZeppAzureFunction `
    -ResourceGroupName "rg-zeppnightscout" `
    -FunctionAppName "func-zepptoken-iponly" `
    -AllowedIpAddress "198.51.100.42" `
    -DisableFunctionAuth
```

**Note:** This relies solely on IP firewall for security. Only use when you have a static IP and want simpler URLs without access keys.

#### Save configuration for reuse

```powershell
Set-ZeppAzureFunction `
    -ResourceGroupName "rg-zeppnightscout" `
    -FunctionAppName "func-zepptoken-prod" `
    -SaveConfig
```

This saves the configuration to a local file (default: `zepp-azure-config.json`) for easy redeployment.

#### Deploy using saved configuration

```powershell
Set-ZeppAzureFunction -LoadConfig
```

This loads all parameters from the saved configuration file and deploys/updates the function.

#### Get help for the cmdlet

```powershell
Get-Help Set-ZeppAzureFunction -Detailed
```

### Testing Azure Function

After deploying an Azure Function, you can test it using the `Test-ZeppAzureFunction` cmdlet to verify it's working correctly.

#### Basic Usage

```powershell
Test-ZeppAzureFunction -FunctionUrl "https://your-function-app.azurewebsites.net/api/GetToken?code=your-function-key"
```

This will:
- Test HTTP connectivity to the function
- Validate the response is valid JSON
- Check that the response contains a `token` field
- Optionally validate the `message` field if present
- Display a summary of the test results

#### Parameters

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `FunctionUrl` | Yes* | - | Complete URL of the Azure Function to test, including query parameters (like the code parameter) |
| `ExpectedToken` | No | - | Optional expected token value. If provided, validates the token matches this value |
| `LoadConfig` | No | `false` | Switch to load configuration from saved file and automatically construct the function URL |

*Not required when using `-LoadConfig`

#### Examples

##### Test function connectivity and response structure

```powershell
Test-ZeppAzureFunction -FunctionUrl "https://func-zepptoken.azurewebsites.net/api/GetToken?code=abc123xyz"
```

This checks that:
- The function is accessible
- Returns valid JSON
- Contains a `token` field

##### Test using saved configuration

```powershell
Test-ZeppAzureFunction -LoadConfig
```

This automatically constructs the function URL from your saved configuration and tests the function.

##### Test function with expected token value

```powershell
Test-ZeppAzureFunction `
    -FunctionUrl "https://func-zepptoken.azurewebsites.net/api/GetToken?code=abc123xyz" `
    -ExpectedToken "DUMMY-TOKEN"
```

This additionally validates that the token value matches "DUMMY-TOKEN".

##### Test function without authentication (IP firewall only)

If you deployed with `-DisableFunctionAuth`, the URL doesn't need a code parameter:

```powershell
Test-ZeppAzureFunction -FunctionUrl "https://func-zepptoken.azurewebsites.net/api/GetToken"
```

#### Understanding Test Results

The cmdlet will output:
- ✓ Green checkmarks for successful validations
- ✗ Red X marks for failures
- ⚠ Yellow warnings for optional items
- A summary showing the function URL, status, and token value

**Example successful output:**
```
================================================
  Test Completed Successfully! ✓
================================================

Summary:
  Function URL: https://func-zepptoken.azurewebsites.net/api/GetToken?code=...
  Status: Passed ✓
  Token: DUMMY-TOKEN
  Message: This is a dummy API token for testing purposes
```

#### Get help for the cmdlet

```powershell
Get-Help Test-ZeppAzureFunction -Detailed
```

### Managing Configuration Files

The deployment scripts support saving and loading configuration to make redeployments easier.

#### Get-ZeppConfig - Retrieve Saved Configuration

Retrieves the saved deployment configuration that was created with `Set-ZeppAzureFunction -SaveConfig`.

**Usage:**

```powershell
# View saved configuration
Get-ZeppConfig

# Get configuration as JSON
Get-ZeppConfig -AsJson

# Use custom config file name
Get-ZeppConfig -ConfigName "my-custom-config"
```

**Parameters:**

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `ConfigName` | No | `zepp-azure-config` | Optional custom configuration file name |
| `AsJson` | No | `false` | Returns configuration as JSON string instead of PowerShell object |

**What it displays:**
- ResourceGroupName
- FunctionAppName
- Location
- AllowedIpAddress
- StorageAccountName
- DisableFunctionAuth setting

#### Test-ZeppConfig - Validate Configuration

Validates the saved deployment configuration before using it.

**Usage:**

```powershell
# Basic validation
Test-ZeppConfig

# Detailed validation with recommendations
Test-ZeppConfig -Detailed

# Validate custom config file
Test-ZeppConfig -ConfigName "my-custom-config" -Detailed
```

**Parameters:**

| Parameter | Required | Default | Description |
|-----------|----------|---------|-------------|
| `ConfigName` | No | `zepp-azure-config` | Optional custom configuration file name |
| `Detailed` | No | `false` | Shows detailed validation results for each field |

**What it validates:**
- ✓ Configuration file exists and is readable
- ✓ Required fields are present (ResourceGroupName, FunctionAppName)
- ✓ IP address format is valid
- ✓ Storage account name format is correct (3-24 lowercase alphanumeric)
- ⚠ Provides warnings for security best practices

**Example workflow:**

```powershell
# 1. Deploy and save configuration
Set-ZeppAzureFunction -ResourceGroupName "rg-zepp" -FunctionAppName "func-zepp" -SaveConfig

# 2. Verify saved configuration
Get-ZeppConfig

# 3. Validate before redeployment
Test-ZeppConfig -Detailed

# 4. Redeploy using saved configuration
Set-ZeppAzureFunction -LoadConfig

# 5. Test using saved configuration
Test-ZeppAzureFunction -LoadConfig
```

## What the Script Does

1. **Validates Prerequisites**
   - Checks if Azure PowerShell (Az module) is available
   - Verifies Azure login status
   - Installs missing Az modules if needed (in Cloud Shell, they're pre-installed)

2. **Creates Azure Resources**
   - Resource Group (if it doesn't exist)
   - Storage Account (required for Azure Functions)
   - Function App with Python 3.11 runtime
   - Flex Consumption plan for cost-effective hosting

3. **Deploys Function Code**
   - Creates HTTP-triggered Python function named "GetToken"
   - Returns JSON response: `{"token": "DUMMY-TOKEN", "message": "..."}`
   - Code is editable directly in Azure Portal

4. **Configures Security**
   - Applies IP access restrictions (if specified)
   - Configures function-level authentication (unless disabled with `-DisableFunctionAuth`)
   - Provides secure function URL with access key (if auth enabled)

## Function Response

The deployed function returns the following JSON response:

```json
{
  "token": "DUMMY-TOKEN",
  "message": "This is a dummy API token for testing purposes"
}
```

## Testing the Function

After deployment, the script will output a function URL. You can test it using several methods:

### Using Test-ZeppAzureFunction Cmdlet

**Recommended:** Use the built-in test cmdlet for comprehensive validation:

```powershell
# Basic test
Test-ZeppAzureFunction -FunctionUrl "https://your-function-app.azurewebsites.net/api/GetToken?code=your-function-key"

# Test with expected token validation
Test-ZeppAzureFunction `
    -FunctionUrl "https://your-function-app.azurewebsites.net/api/GetToken?code=your-function-key" `
    -ExpectedToken "DUMMY-TOKEN"
```

See the [Testing Azure Function](#testing-azure-function) section above for more details and examples.

### Using curl

```bash
curl "https://your-function-app.azurewebsites.net/api/GetToken?code=your-function-key"
```

### Using PowerShell

```powershell
Invoke-RestMethod -Uri "https://your-function-app.azurewebsites.net/api/GetToken?code=your-function-key"
```

### Using a Web Browser

Simply paste the function URL (including the code parameter) into your browser.

## Updating the Token

There are three ways to update the token value in your Azure Function:

### Option 1: Using Update-ZeppAzureToken Cmdlet (Recommended)

**This is the recommended and most secure method.** Use the `Update-ZeppAzureToken` cmdlet to update the token directly from the command line without needing portal access.

```powershell
# Update token with prompt for secure input (recommended)
Update-ZeppAzureToken -ResourceGroupName "rg-zeppnightscout" -FunctionAppName "func-zepptoken"

# Update using saved configuration (easiest)
Update-ZeppAzureToken -LoadConfig

# Update with token as parameter (less secure - visible in command history)
Update-ZeppAzureToken -LoadConfig -Token "your-actual-nightscout-token-here"
```

**Benefits:**
- ✅ Secure token entry (hidden input when prompted)
- ✅ No need for portal access
- ✅ Works from command line or scripts
- ✅ Uses saved configuration for convenience
- ✅ Changes take effect immediately

**Getting help:**
```powershell
Get-Help Update-ZeppAzureToken -Detailed
```

### Option 2: Edit in Azure Portal

The deployment script uses Flex Consumption plan where portal editing is enabled by default after zip deployment.

To edit the function in the Azure Portal:

1. Go to https://portal.azure.com
2. Navigate to your Function App
3. Select **Functions** → **GetToken**
4. Click **Code + Test**
5. Edit the `__init__.py` file to change the token value:
   ```python
   response_data = {
       "token": "YOUR-ACTUAL-TOKEN-HERE",
       "message": "This is a Nightscout API token"
   }
   ```
6. Click **Save** to deploy your changes

**Note:** Portal editing is enabled by default on Flex Consumption plans. If you encounter any issues with editing:
- Use Option 1 above (Update-ZeppAzureToken cmdlet) - **recommended**
- Or check the function logs for any deployment errors

### Option 3: Edit Before Deployment

To modify the function before deploying:

1. Edit `scripts/azure-function-template/__init__.py` in the repository
2. Change the token value in the response:
   ```python
   response_data = {
       "token": "YOUR-ACTUAL-TOKEN-HERE",
       "message": "This is a Nightscout API token"
   }
   ```
3. Run the PowerShell deployment script to deploy the updated code

## Debugging and Monitoring

The function includes comprehensive debug logging to help diagnose issues.

### Viewing Function Logs

To view logs in the Azure Portal:

1. Go to https://portal.azure.com
2. Navigate to your Function App
3. Select **Functions** → **GetToken**
4. Click **Monitor** → **Logs**
5. Run a test request and watch the logs in real-time

### What Gets Logged

The function automatically logs:

- **Request Information**: HTTP method, URL, query parameters (with sensitive data masked)
- **Headers**: All request headers (authorization tokens are masked)
- **Request Body**: Size of the request body
- **Response**: Success status and response size
- **Errors**: Complete exception details including type, message, and traceback

### Example Log Output (Success)

```
=== GetToken Function Invoked ===
Request Method: GET
Request URL: https://func-zepptoken.azurewebsites.net/api/GetToken
Query Parameters: {'code': '***REDACTED***'}
Request Headers: {'User-Agent': 'curl/7.68.0', 'Accept': '*/*'}
Request Body Length: 0 bytes
Generating token response...
Response prepared successfully: 89 bytes
=== GetToken Function Completed Successfully ===
```

### Example Log Output (Error)

If an error occurs, you'll see detailed error information in the logs (error details are not exposed to clients for security):

```
=== GetToken Function ERROR ===
Exception Type: ValueError
Exception Message: Invalid token format
Traceback: <full stack trace>
```

**Note**: For security reasons, error responses to clients contain a generic error message. Detailed error information (exception type, message, and traceback) is only available in the function logs.

### Common Issues and Solutions

#### 500 Internal Server Error

If you see a 500 error:

1. Check the function logs in Azure Portal (Monitor → Logs)
2. Look for the `=== GetToken Function ERROR ===` marker in logs
3. Review the exception type, message, and full traceback in the logs
4. Note: For security reasons, error responses to clients contain only a generic message. Detailed error information (exception type, message, and traceback) is available only in the function logs.

5. Common causes and solutions:
   - **Missing dependencies**: Ensure all required Python packages are installed
   - **Configuration issues**: Check Application Settings for missing or incorrect values
   - **Runtime errors**: Review the traceback in logs to identify the exact line causing the issue
   - **Timeout**: Check if the function is timing out (default is 5 minutes)

6. To enable even more detailed logging:
   - Go to Configuration → Application Settings
   - Add or update `PYTHON_ENABLE_WORKER_EXTENSIONS` = `1`
   - Add or update `FUNCTIONS_WORKER_RUNTIME` = `python`
   - Restart the function app

7. For persistent issues:
   - Check the full logs in Application Insights (if enabled)
   - Review the Diagnose and solve problems section in the Function App
   - Ensure the Python runtime version matches (3.11)

#### Missing Logs

If logs aren't appearing:

1. Ensure you've saved your changes to the function
2. Wait a few seconds for logs to propagate
3. Check Application Insights for historical logs
4. Verify the logging level in `host.json` is set to "Information" or higher

### Application Insights

For long-term monitoring and analytics, enable Application Insights:

1. Go to your Function App in Azure Portal
2. Select **Application Insights** from the menu
3. Click **Turn on Application Insights**
4. Create a new Application Insights resource or use an existing one
5. Access logs, traces, and performance metrics in Application Insights

## Security Considerations

### Understanding Authentication Options

Azure Functions provides two layers of security that can be used independently or together:

#### 1. Function-Level Authentication (Default)

When enabled (default), the function requires an access key in the URL:
- **URL format:** `https://your-function.azurewebsites.net/api/GetToken?code=ACCESS_KEY`
- **Pros:** 
  - Works from any IP address
  - Can rotate keys without infrastructure changes
  - Multiple keys can be created for different clients
- **Cons:**
  - URL contains sensitive access key
  - Key could be exposed in logs, browser history, etc.

#### 2. IP Firewall Only (Use `-DisableFunctionAuth`)

When you disable function authentication and use IP restrictions:
- **URL format:** `https://your-function.azurewebsites.net/api/GetToken` (no access key needed)
- **Pros:**
  - Simpler URLs without sensitive data
  - No risk of key exposure in logs/history
  - Cleaner integration with applications
- **Cons:**
  - Requires static IP address
  - Must update firewall rules if IP changes
  - All traffic from allowed IP is trusted

**Recommendation:** Use IP firewall only (`-DisableFunctionAuth`) when:
- You have a static IP address
- You want simpler URLs without access keys
- You trust all applications/users from that IP

Use function-level authentication when:
- You need to access from multiple/dynamic IPs
- You want granular access control with multiple keys
- You need to rotate credentials without infrastructure changes

### IP Restrictions

- **Recommended**: Always specify an IP address or CIDR range
- The function will only accept requests from the allowed IP(s)
- You can add multiple IP restrictions in the Azure Portal

#### Changing IP Address After Deployment

To update the allowed IP address after deployment:

##### Option 1: Using Azure Portal (Easiest)
1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to your Function App
3. Select **Networking** → **Access restriction**
4. Edit the "AllowSpecificIP" rule or add new rules
5. Click **Save**

##### Option 2: Using PowerShell
```powershell
# Remove old IP restriction
Remove-AzWebAppAccessRestrictionRule `
    -ResourceGroupName "rg-zeppnightscout" `
    -WebAppName "func-zepptoken" `
    -Name "AllowSpecificIP"

# Add new IP restriction
Add-AzWebAppAccessRestrictionRule `
    -ResourceGroupName "rg-zeppnightscout" `
    -WebAppName "func-zepptoken" `
    -Name "AllowSpecificIP" `
    -Action Allow `
    -IpAddress "NEW.IP.ADDRESS.HERE" `
    -Priority 100
```

##### Option 3: Using Azure Cloud Shell (Alternative with Azure CLI)
Open Cloud Shell in Azure Portal and run these Azure CLI commands:
```bash
# Remove old rule
az functionapp config access-restriction remove \
    --resource-group rg-zeppnightscout \
    --name func-zepptoken \
    --rule-name AllowSpecificIP

# Add new rule
az functionapp config access-restriction add \
    --resource-group rg-zeppnightscout \
    --name func-zepptoken \
    --rule-name AllowSpecificIP \
    --action Allow \
    --ip-address NEW.IP.ADDRESS.HERE \
    --priority 100
```

**Note:** Azure Cloud Shell supports both PowerShell and Azure CLI. Use PowerShell (Option 2) for consistency with the deployment script.

### Function Key Authentication

- The function uses function-level authentication by default
- The `code` parameter in the URL is required for access
- Keep the function URL and key secure
- Regenerate keys if compromised:
  1. Go to Azure Portal → Function App → Functions → GetToken
  2. Select **Function Keys**
  3. Click **Regenerate** on the default key

### Best Practices

1. Use IP restrictions for production deployments
2. Consider disabling function auth if using IP firewall only (simpler URLs)
3. Keep function keys secure if using function-level auth (don't commit to source control)
4. Use Azure Key Vault for sensitive configuration
5. Enable Application Insights for monitoring
6. Regularly review access logs

## Costs

The script creates resources on Azure **Flex Consumption Plan**:

- **Free Tier Includes**:
  - 1 million requests per month
  - 400,000 GB-s of execution time per month

- **Estimated Costs** (after free tier):
  - $0.20 per million executions
  - $0.000016 per GB-s of execution time

For detailed pricing, see: https://azure.microsoft.com/pricing/details/functions/

## Troubleshooting

### Error: "Az module not found"

**Solution**: If running locally (not in Cloud Shell), install Azure PowerShell:
```powershell
Install-Module -Name Az -AllowClobber -Scope CurrentUser
```

Or use Azure Cloud Shell where it's pre-installed.

### Error: "Not logged in to Azure"

**Solution**: 
- **In Azure Cloud Shell**: You're automatically authenticated - this shouldn't happen
- **Running locally**: Run `Connect-AzAccount` and follow the authentication prompts

### Error: "Function app name is already taken"

**Solution**: Function app names must be globally unique. Try a different name with a unique suffix:
```powershell
-FunctionAppName "func-zepptoken-$(Get-Random)"
```

### Error: "Storage account name is invalid"

**Solution**: Storage account names must be:
- 3-24 characters
- Lowercase letters and numbers only
- Globally unique

### Warning: "Function deployment may have failed"

The function app is created, but code deployment failed. You can:
1. Manually upload the function code in Azure Portal
2. Re-run the script
3. Check Azure Function App logs for details

### IP Restrictions Not Working

If you can't access the function from your allowed IP:
1. Verify your current public IP address: `curl ifconfig.me`
2. Check the IP restriction rules in Azure Portal (Networking → Access restriction)
3. Ensure the IP address format is correct (e.g., `1.2.3.4` or `1.2.3.0/24`)
4. Wait a few minutes for changes to propagate

### Error: "500 Internal Server Error" when calling the function

If you receive a 500 Internal Server Error when calling the function:

**Solution**: The function now includes comprehensive debug logging to help diagnose the issue:

1. Go to Azure Portal → Your Function App → Functions → GetToken
2. Click **Monitor** → **Logs** to view real-time logs
3. Make a test request to the function
4. Look for detailed error information in the logs:
   - The function will log `=== GetToken Function ERROR ===`
   - Check the exception type, message, and full traceback
   - Note: For security reasons, error responses to clients contain only a generic message. Detailed error information is available only in the function logs.

5. Common causes and solutions:
   - **Missing dependencies**: Ensure all required Python packages are installed
   - **Configuration issues**: Check Application Settings for missing or incorrect values
   - **Runtime errors**: Review the traceback in logs to identify the exact line causing the issue
   - **Timeout**: Check if the function is timing out (default is 5 minutes)

6. To enable even more detailed logging:
   - Go to Configuration → Application Settings
   - Add or update `PYTHON_ENABLE_WORKER_EXTENSIONS` = `1`
   - Add or update `FUNCTIONS_WORKER_RUNTIME` = `python`
   - Restart the function app

7. For persistent issues:
   - Check the full logs in Application Insights (if enabled)
   - Review the Diagnose and solve problems section in the Function App
   - Ensure the Python runtime version matches (3.11)

## Cleanup

To delete all created resources:

### Using PowerShell

```powershell
# Delete the entire resource group (removes all resources)
Remove-AzResourceGroup -Name "rg-zeppnightscout" -Force
```

Or delete individual resources:

```powershell
# Delete only the function app
Remove-AzFunctionApp -Name "func-zepptoken" -ResourceGroupName "rg-zeppnightscout" -Force

# Delete only the storage account
Remove-AzStorageAccount -Name "stzepptoken" -ResourceGroupName "rg-zeppnightscout" -Force
```

### Using Azure Cloud Shell (Azure CLI)

```bash
# Delete the entire resource group
az group delete --name "rg-zeppnightscout" --yes

## Integration with ZeppNightscout

This Azure Function is designed to provide an API token that can be used with the ZeppNightscout watch app. The function URL can be configured in the watch app to fetch the authentication token dynamically.

### Usage in ZeppNightscout

1. Deploy the Azure Function using this script
2. Edit the function in Azure Portal to return your actual Nightscout token
3. Configure the function URL in your ZeppNightscout app
4. The app will fetch the token from the Azure Function

## Additional Resources

- [Azure Functions Documentation](https://learn.microsoft.com/azure/azure-functions/)
- [Azure Functions Python Developer Guide](https://learn.microsoft.com/azure/azure-functions/functions-reference-python)
- [Azure PowerShell Documentation](https://learn.microsoft.com/powershell/azure/)
- [ZeppNightscout Project](https://github.com/iricigor/ZeppNightscout)

## Support

For issues or questions:
- Check the [main README](../README.md)
- Review Azure Function logs in the portal
- Open an issue in the GitHub repository
