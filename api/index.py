import os
import sys

# Add parent directory to path so app.py and database.py can be imported cleanly
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app

# Vercel serverless function export
app = app
