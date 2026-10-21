import os

filepath = 'd:\\candidate_followup\\ai_backend\\main.py'

# Read original carefully
with open(filepath, 'rb') as f:
    raw_data = f.read()

encoding = 'utf-8'
try:
    content = raw_data.decode('utf-8')
except:
    content = raw_data.decode('gbk')
    encoding = 'gbk'

part1 = 'from fastapi.responses import JSONResponse\n'
rep1 = 'from fastapi.responses import JSONResponse, StreamingResponse\nfrom io import BytesIO\n'
content = content.replace(part1, rep1)

part2 = 'from services.match_engine import match_candidates_for_order\n'
rep2 = 'from services.match_engine import match_candidates_for_order\nfrom services.docx_exporter import export_cv_to_docx\n'
content = content.replace(part2, rep2)

part3 = 'return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})\n'
rep3 = part3 + '''

class ExportDocxRequest(BaseModel):
    parsed_data: dict

@app.post("/api/export/cv-docx")
async def export_cv_docx_endpoint(req: ExportDocxRequest):
    try:
        template_path = os.path.join(os.path.dirname(__file__), "..", "Sunrise CV - Job Title - Full Name (1).docx")
        out_stream = export_cv_to_docx(req.parsed_data, template_path)
        
        headers = {
            'Content-Disposition': 'attachment; filename="Sunrise_CV.docx"'
        }
        return StreamingResponse(out_stream, media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document", headers=headers)
        
    except Exception as e:
        logger.error(f"Docx export error: {e}", exc_info=True)
        return JSONResponse(status_code=500, content={"status": "error", "message": str(e)})
'''

# Find the LAST instance of part3
last_idx = content.rfind(part3)
if last_idx != -1:
    content = content[:last_idx] + rep3 + content[last_idx+len(part3):]

# Write back using the original encoding so we don't break anything!
with open(filepath, 'w', encoding=encoding) as f:
    f.write(content)

print(f"Patched main.py successfully using {encoding} encoding")
