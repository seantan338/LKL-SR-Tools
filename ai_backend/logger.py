import logging
import sys

def setup_logger(name: str = "talent_flow_ai") -> logging.Logger:
    """
    Sets up a structured logger for the AI Backend that outputs to stdout.
    This ensures logs are captured properly by Render's log viewer.
    """
    logger = logging.getLogger(name)
    
    # Only configure if it doesn't already have handlers to avoid duplicates
    if not logger.handlers:
        logger.setLevel(logging.INFO)
        
        # Create console handler
        console_handler = logging.StreamHandler(sys.stdout)
        console_handler.setLevel(logging.INFO)
        
        # Create formatter
        formatter = logging.Formatter(
            '%(asctime)s [%(levelname)s] %(name)s: %(message)s',
            datefmt='%Y-%m-%d %H:%M:%S'
        )
        
        # Add formatter to handler
        console_handler.setFormatter(formatter)
        
        # Add handler to logger
        logger.addHandler(console_handler)
        
    return logger

# Create a default logger instance to be imported across the backend
logger = setup_logger()
