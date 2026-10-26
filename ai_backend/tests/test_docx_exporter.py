import os
import sys
import pytest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from services.docx_exporter import resolve_cv_template_path, export_cv_to_docx


def test_resolve_cv_template_path_default():
    path = resolve_cv_template_path()
    assert os.path.exists(path)
    assert path.lower().endswith(".docx")


def test_resolve_cv_template_path_env_override(monkeypatch):
    valid_path = resolve_cv_template_path()
    monkeypatch.setenv("CV_TEMPLATE_PATH", valid_path)
    assert resolve_cv_template_path() == valid_path


def test_resolve_cv_template_path_not_found(monkeypatch):
    monkeypatch.setenv("CV_TEMPLATE_PATH", "/non/existent/path/template.docx")
    with pytest.MonkeyPatch.context() as m:
        # Patch exists to always return False
        m.setattr(os.path, "exists", lambda p: False)
        with pytest.raises(FileNotFoundError) as exc_info:
            resolve_cv_template_path()
        assert "Sunrise CV Template not found" in str(exc_info.value)


def test_export_cv_to_docx_success():
    sample_cv = {
        "personal_information": {
            "name": "Alex Tan",
            "phone": "+60123456789",
            "email": "alex.tan@example.com",
            "address": "Kuala Lumpur, Malaysia",
            "gender": "Male",
            "nationality": "Malaysian",
            "expected_salary": "RM 6,000"
        },
        "professional_history": [
            {
                "company": "Sunrise Talent Global",
                "position": "Senior HR Consultant",
                "period": "2023 - Present",
                "responsibilities": ["Lead tech recruitment team", "Client relationship management"]
            }
        ],
        "education": [
            {
                "school": "University of Malaya",
                "degree": "Bachelor of Business Administration",
                "year": "2022"
            }
        ],
        "skills": ["Executive Search", "Technical Sourcing"],
        "languages": ["English", "Malay", "Mandarin"]
    }

    out_stream = export_cv_to_docx(sample_cv)
    assert out_stream is not None
    assert len(out_stream.getvalue()) > 1000
