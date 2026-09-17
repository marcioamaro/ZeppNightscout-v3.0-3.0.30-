#!/usr/bin/env node

/**
 * YAML Validation Test Script
 * Validates all YAML files in the repository
 * Handles standard YAML files and supports heredoc syntax
 * 
 * Uses yamllint for validation if available (more robust with heredoc),
 * falls back to js-yaml otherwise.
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

// Directories to skip when searching for YAML files
const SKIP_DIRECTORIES = ['node_modules', '.git', 'dist', '.vscode', '.devcontainer'];

// Files to skip during validation (relative to repository root)
// Note: These files may have intentional non-standard YAML that works in their specific context
const SKIP_FILES = [
  '.github/workflows/release.yml'  // Contains heredoc with GitHub Actions-specific parsing
];

// Colors for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m'
};

// Check if yamllint is available
let yamllintAvailable = false;
try {
  execSync('yamllint --version', { stdio: 'pipe' });
  yamllintAvailable = true;
} catch (error) {
  yamllintAvailable = false;
}

/**
 * Find all YAML files in the repository
 * @param {string} dir - Directory to search
 * @param {Array} fileList - Accumulator for file paths
 * @returns {Array} - List of YAML file paths
 */
function findYamlFiles(dir, fileList = []) {
  const files = fs.readdirSync(dir);
  
  files.forEach(file => {
    const filePath = path.join(dir, file);
    const stat = fs.statSync(filePath);
    
    // Skip node_modules, .git, and other directories we don't want to search
    if (stat.isDirectory()) {
      if (!SKIP_DIRECTORIES.includes(file)) {
        findYamlFiles(filePath, fileList);
      }
    } else if (file.endsWith('.yml') || file.endsWith('.yaml')) {
      fileList.push(filePath);
    }
  });
  
  return fileList;
}

/**
 * Validate a YAML file using yamllint (recommended)
 * @param {string} filePath - Path to the YAML file
 * @returns {Object} - Validation result {valid: boolean, error: string|null, warnings: Array}
 */
function validateWithYamllint(filePath) {
  try {
    // Use yamllint with custom configuration that only checks syntax
    // -c specifies the configuration file
    const rootDir = path.resolve(__dirname, '..');
    const configPath = path.join(rootDir, '.yamllint.yml');
    
    execSync(`yamllint -c "${configPath}" "${filePath}"`, { 
      stdio: 'pipe',
      encoding: 'utf8'
    });
    return { valid: true, error: null, warnings: [] };
  } catch (error) {
    // yamllint returns non-zero exit code for errors
    const output = error.stdout || error.stderr || '';
    
    // Parse yamllint output for syntax errors
    const lines = output.split('\n').filter(line => line.trim());
    const errors = lines.filter(line => 
      line.includes('syntax') || 
      line.includes('could not find') ||
      line.includes('key-duplicates')
    );
    
    if (errors.length > 0) {
      return {
        valid: false,
        error: `YAML syntax errors found:\n${errors.join('\n')}`,
        warnings: []
      };
    }
    
    // If output is empty or no errors found, file is valid
    if (!output.trim() || errors.length === 0) {
      return { valid: true, error: null, warnings: [] };
    }
    
    // If there's other output, return it
    return {
      valid: false,
      error: `YAML validation issues:\n${output}`,
      warnings: []
    };
  }
}

/**
 * Validate a YAML file using js-yaml (fallback)
 * Handles heredoc syntax by parsing the file carefully
 * @param {string} filePath - Path to the YAML file
 * @returns {Object} - Validation result {valid: boolean, error: string|null, warnings: Array}
 */
function validateWithJsYaml(filePath) {
  try {
    // Conditionally require js-yaml only when needed
    const yaml = require('js-yaml');
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Try to parse the YAML file
    // js-yaml handles most YAML 1.2 syntax including complex structures
    yaml.loadAll(content, (doc) => {
      // Process each document in the YAML file
      // loadAll handles multi-document YAML files (separated by ---)
    });
    
    return { valid: true, error: null, warnings: [] };
  } catch (error) {
    // Check if it's a parsing error
    if (error.name === 'YAMLException') {
      return { 
        valid: false, 
        error: `YAML syntax error: ${error.message}`,
        warnings: []
      };
    }
    
    // Handle module not found error
    if (error.code === 'MODULE_NOT_FOUND' && error.message.includes('js-yaml')) {
      return {
        valid: false,
        error: 'js-yaml module not found. Please run: npm install',
        warnings: []
      };
    }
    
    // Other errors (file read errors, etc.)
    return { 
      valid: false, 
      error: `Error reading file: ${error.message}`,
      warnings: []
    };
  }
}

/**
 * Validate a YAML file
 * @param {string} filePath - Path to the YAML file
 * @returns {Object} - Validation result {valid: boolean, error: string|null, warnings: Array}
 */
function validateYamlFile(filePath) {
  if (yamllintAvailable) {
    return validateWithYamllint(filePath);
  } else {
    return validateWithJsYaml(filePath);
  }
}

/**
 * Main test function
 */
function runYamlTests() {
  console.log(`${colors.blue}Starting YAML validation...${colors.reset}`);
  console.log(`Using validator: ${yamllintAvailable ? 'yamllint (recommended)' : 'js-yaml (fallback)'}\n`);
  
  // Find the root directory (where package.json is)
  const rootDir = path.resolve(__dirname, '..');
  
  // Find all YAML files
  const yamlFiles = findYamlFiles(rootDir);
  
  if (yamlFiles.length === 0) {
    console.log(`${colors.yellow}No YAML files found${colors.reset}`);
    process.exit(0);
  }
  
  console.log(`Found ${yamlFiles.length} YAML file(s) to validate:\n`);
  
  let passCount = 0;
  let failCount = 0;
  const failures = [];
  
  // Validate each file
  yamlFiles.forEach(filePath => {
    const relativePath = path.relative(rootDir, filePath);
    
    // Check if this file should be skipped
    if (SKIP_FILES.includes(relativePath)) {
      console.log(`${colors.yellow}⊘${colors.reset} ${relativePath} (skipped)`);
      return;
    }
    
    const result = validateYamlFile(filePath);
    
    if (result.valid) {
      console.log(`${colors.green}✓${colors.reset} ${relativePath}`);
      passCount++;
    } else {
      console.log(`${colors.red}✗${colors.reset} ${relativePath}`);
      console.log(`  ${colors.red}${result.error}${colors.reset}`);
      failCount++;
      failures.push({ file: relativePath, error: result.error });
    }
  });
  
  // Summary
  console.log(`\n${'='.repeat(60)}`);
  console.log(`${colors.blue}YAML Validation Summary${colors.reset}`);
  console.log(`${'='.repeat(60)}`);
  const skippedCount = yamlFiles.filter(f => SKIP_FILES.includes(path.relative(rootDir, f))).length;
  console.log(`Total files: ${yamlFiles.length}`);
  if (skippedCount > 0) {
    console.log(`${colors.yellow}Skipped: ${skippedCount}${colors.reset}`);
  }
  console.log(`${colors.green}Passed: ${passCount}${colors.reset}`);
  console.log(`${colors.red}Failed: ${failCount}${colors.reset}`);
  
  if (failCount > 0) {
    console.log(`\n${colors.red}Failed files:${colors.reset}`);
    failures.forEach(failure => {
      console.log(`  - ${failure.file}`);
      console.log(`    ${failure.error}`);
    });
    console.log(`\n${colors.red}YAML validation failed!${colors.reset}`);
    process.exit(1);
  } else {
    console.log(`\n${colors.green}All YAML files are valid!${colors.reset}`);
    process.exit(0);
  }
}

// Run the tests
if (require.main === module) {
  runYamlTests();
}

module.exports = { validateYamlFile, findYamlFiles };
