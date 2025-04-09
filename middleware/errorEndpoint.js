const errorEndpoint = (filePath, functionName, error) => {
  const enhancedError = new Error(
    `Error in ${filePath}, function '${functionName}' ${error.message}`
  );
  enhancedError.status = error.status || 500;
  enhancedError.stack = error.stack; // Preserve the original stack trace
  return enhancedError;
};

module.exports = errorEndpoint;
