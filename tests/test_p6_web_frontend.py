"""
NEURA AI — Phase P6 Acceptance Tests (Web Frontend)
Validates web build artifacts, components, audio worklet bindings, and frontend integration.
"""

from pathlib import Path

WORKSPACE_ROOT = Path(__file__).resolve().parent.parent
WEB_DIR = WORKSPACE_ROOT / "apps" / "web"
SRC_DIR = WEB_DIR / "src"
COMPONENTS_DIR = SRC_DIR / "components"
SERVICES_DIR = SRC_DIR / "services"
DIST_DIR = WEB_DIR / "dist"


def test_p6_web_components_exist():
    """Verify all required P6 UI components are present and non-empty."""
    required_components = [
        "Navbar.tsx",
        "VoiceTutor.tsx",
        "SocraticChat.tsx",
        "DocumentHub.tsx",
        "FlashcardStudio.tsx",
        "StudyOrganizer.tsx",
        "SystemTelemetry.tsx",
    ]
    for comp in required_components:
        comp_path = COMPONENTS_DIR / comp
        assert comp_path.exists(), f"Missing required component: {comp}"
        content = comp_path.read_text(encoding="utf-8")
        assert len(content) > 200, f"Component {comp} appears empty"


def test_p6_audio_manager_service():
    """Verify AudioManager has 16kHz Web Audio capture, RMS energy, and queue playback."""
    audio_service_path = SERVICES_DIR / "audio.ts"
    assert audio_service_path.exists(), "audio.ts service is missing"
    content = audio_service_path.read_text(encoding="utf-8")
    assert "startRecording" in content
    assert "stopRecording" in content
    assert "getEnergy" in content
    assert "playBase64Wav" in content
    assert "clearPlaybackQueue" in content
    assert "16000" in content


def test_p6_api_service_client():
    """Verify API client defines streaming SSE chat, SM-2 cards review, and auth."""
    api_service_path = SERVICES_DIR / "api.ts"
    assert api_service_path.exists(), "api.ts service is missing"
    content = api_service_path.read_text(encoding="utf-8")
    assert "ensureAuthenticated" in content
    assert "streamChat" in content
    assert "uploadDocument" in force_str(content)
    assert "forceSummarizeDocument" in content
    assert "reviewFlashcard" in content
    assert "generateFlashcards" in content


def test_p6_sm2_3d_flip_css():
    """Verify CSS has 3D perspective and backface-visibility for card review."""
    index_css = SRC_DIR / "index.css"
    assert index_css.exists(), "index.css is missing"
    content = index_css.read_text(encoding="utf-8")
    assert "perspective-1000" in content
    assert "transform-style-preserve-3d" in content
    assert "backface-hidden" in content
    assert "rotate-y-180" in content
    assert "bezel-shell" in content
    assert "bezel-core" in content


def test_p6_production_dist_bundle_exists():
    """Verify Vite production bundle exists with valid HTML and JS/CSS assets."""
    index_html = DIST_DIR / "index.html"
    assert index_html.exists(), "dist/index.html does not exist; run `npm run build`"
    html_content = index_html.read_text(encoding="utf-8")
    assert '<div id="root">' in html_content
    assert "NEURA AI" in html_content

    assets_dir = DIST_DIR / "assets"
    assert assets_dir.exists(), "dist/assets does not exist"
    js_files = list(assets_dir.glob("*.js"))
    css_files = list(assets_dir.glob("*.css"))
    assert len(js_files) >= 1, "Expected at least one bundled JS artifact"
    assert len(css_files) >= 1, "Expected at least one bundled CSS artifact"


def test_p6_bilingual_voice_selection_options():
    """Verify VoiceTutor component supports Tamil (Selvi) and English (Kavitha/Lessac)."""
    voice_tutor = COMPONENTS_DIR / "VoiceTutor.tsx"
    content = voice_tutor.read_text(encoding="utf-8")
    assert "ta_IN" in content
    assert "en_IN" in content
    assert "en_US" in content
    assert "Barge-in" in content or "interrupt" in content
    assert "rmsEnergy" in content


def test_p6_socratic_chat_citations_rendering():
    """Verify SocraticChat renders clickable source citations and syllabus subjects."""
    chat_file = COMPONENTS_DIR / "SocraticChat.tsx"
    content = chat_file.read_text(encoding="utf-8")
    assert "CS3301" in content
    assert "CS3452" in content
    assert "CS3401" in content
    assert "Citation" in content
    assert "activeCitation" in content


def test_p6_tele_manas_hotline_integrated():
    """Verify Tele-MANAS crisis helpline (14416) is permanently displayed in telemetry."""
    telemetry_file = COMPONENTS_DIR / "SystemTelemetry.tsx"
    content = telemetry_file.read_text(encoding="utf-8")
    assert "14416" in content
    assert "Tele-MANAS" in content


def force_str(text: str) -> str:
    return str(text)
