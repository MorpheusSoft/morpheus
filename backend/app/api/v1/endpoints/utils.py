from typing import Any
from fastapi import APIRouter, UploadFile, File, HTTPException
import shutil
import os
from datetime import datetime
import uuid
from PIL import Image
from io import BytesIO

router = APIRouter()

UPLOAD_DIR = "static/uploads"

# Ensure upload directory exists
os.makedirs(UPLOAD_DIR, exist_ok=True)

@router.post("/upload/", response_model=dict)
async def upload_file(
    file: UploadFile = File(...)
) -> Any:
    """
    Upload a file (Image or PDF).
    Images are resized and optimized.
    Returns the URL of the uploaded file.
    """
    if not file:
        raise HTTPException(status_code=400, detail="No file sent")

    # Generate unique filename
    ext = os.path.splitext(file.filename)[1].lower()
    filename = f"{datetime.now().strftime('%Y%m%d')}_{uuid.uuid4().hex[:8]}{ext}"
    file_path = os.path.join(UPLOAD_DIR, filename)
    
    # 1. Handle Images (Resize & Optimize)
    if ext in ['.jpg', '.jpeg', '.png', '.webp']:
        try:
            contents = await file.read()
            img = Image.open(BytesIO(contents))
            
            # Convert to RGB if RGBA (for JPEG compatibility)
            if img.mode in ("RGBA", "P"):
                img = img.convert("RGB")
                
            # Resize if too large (Max width 1024px)
            max_width = 1024
            if img.width > max_width:
                aspect_ratio = img.height / img.width
                new_height = int(max_width * aspect_ratio)
                img = img.resize((max_width, new_height), Image.Resampling.LANCZOS)
            
            # Save optimized (Quality 85)
            # We enforce .jpg for consistency or keep original extension if supported?
            # Let's keep original extension but maximize compatibility
            img.save(file_path, optimize=True, quality=85)
            
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error processing image: {str(e)}")
            
    # 2. Handle PDFs & Others (Save as is)
    else:
        try:
            with open(file_path, "wb") as buffer:
                shutil.copyfileobj(file.file, buffer)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Error saving file: {str(e)}")
        finally:
            file.file.close()

    # Return URL (Relative to backend URL)
    # Assuming valid static mount at /static
    file_url = f"/static/uploads/{filename}"
    
    return {"url": file_url, "filename": filename}
