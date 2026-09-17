import logging
import json
import traceback
import azure.functions as func

# Configuration constants
MAX_BODY_LOG_SIZE = 1024 * 1024  # 1MB
SENSITIVE_PARAM_NAMES = {'code', 'key', 'token', 'secret', 'password', 'api_key', 'apikey', 'auth'}
SENSITIVE_HEADER_NAMES = {'authorization', 'x-functions-key', 'cookie'}

def main(req: func.HttpRequest, res: func.Out[func.HttpResponse]) -> None:
    """
    HTTP trigger function that provides a dummy API token.
    
    Uses output binding to set the HTTP response via the 'res' parameter.
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
            "token": "DUMMY-TOKEN",
            "message": "This is a dummy API token for testing purposes"
        }
        
        # Convert to JSON
        response_json = json.dumps(response_data)
        logging.info(f'Response prepared successfully: {len(response_json)} bytes')
        
        # Set the response using output binding
        response = func.HttpResponse(
            body=response_json,
            mimetype="application/json",
            status_code=200
        )
        
        logging.info('=== GetToken Function Completed Successfully ===')
        res.set(response)
        
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
        
        res.set(func.HttpResponse(
            body=json.dumps(error_response),
            mimetype="application/json",
            status_code=500
        ))
