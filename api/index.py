import os
import sys

# Flag environment for Vercel
os.environ['VERCEL'] = '1'

# Add root directory to python module search path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app import app

# Export for Vercel Serverless Function
app = app
