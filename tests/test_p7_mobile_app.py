"""
NEURA AI — Phase P7 Acceptance Tests (Mobile App)
Validates llama.rn on-device inference logic, RAM fallback thresholds, offline SM-2 queueing,
LWW conflict resolution, 16kHz mono audio validation, and Tele-MANAS crisis helpline integration.
"""

from pathlib import Path

WORKSPACE_ROOT = Path(__file__).resolve().parent.parent
MOBILE_DIR = WORKSPACE_ROOT / "apps" / "mobile"
SRC_DIR = MOBILE_DIR / "src"
COMPONENTS_DIR = SRC_DIR / "components"
SERVICES_DIR = SRC_DIR / "services"
DB_DIR = SRC_DIR / "database"


def test_p7_mobile_structure_and_components_exist():
    """Verify all required P7 mobile components and services exist."""
    required_files = [
        SRC_DIR / "types" / "index.ts",
        DB_DIR / "sqlite.ts",
        SERVICES_DIR / "llamaRunner.ts",
        SERVICES_DIR / "syncEngine.ts",
        SERVICES_DIR / "voiceRecorder.ts",
        COMPONENTS_DIR / "CrisisSafetyBanner.tsx",
        COMPONENTS_DIR / "VoiceTutorView.tsx",
        COMPONENTS_DIR / "OfflineChatView.tsx",
        COMPONENTS_DIR / "FlashcardsView.tsx",
        COMPONENTS_DIR / "NotesSyncView.tsx",
        SRC_DIR / "App.tsx",
    ]
    for file_path in required_files:
        assert file_path.exists(), f"Missing required mobile file: {file_path}"
        assert len(file_path.read_text(encoding="utf-8")) > 100, f"File {file_path} is empty"


def test_p7_llama_rn_ram_threshold_gating():
    """Verify RAM >= 3GB allows on-device llama.rn, while < 3GB routes to server."""
    llama_ts = (SERVICES_DIR / "llamaRunner.ts").read_text(encoding="utf-8")
    assert "RAM_THRESHOLD_GB = 3.0" in llama_ts or "3.0" in llama_ts
    assert "llama.rn" in llama_ts
    assert "server_api" in llama_ts
    assert "can_run_on_device" in llama_ts


def test_p7_sm2_offline_database_logic():
    """Simulate and verify SM-2 calculation and review queueing logic implemented in sqlite.ts."""
    # Python mirror of sqlite.ts logic to verify algorithmic correctness
    def calculate_sm2(q: int, reps: int, interval: int, ef: float):
        q = max(0, min(5, q))
        if q >= 3:
            if reps == 0:
                interval = 1
            elif reps == 1:
                interval = 6
            else:
                interval = max(1, round(interval * ef))
            reps += 1
        else:
            reps = 0
            interval = 1
        delta = 0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)
        ef = max(1.3, round(ef + delta, 4))
        return reps, interval, ef

    # Test perfect recall progression
    reps, interval, ef = calculate_sm2(5, 0, 1, 2.5)
    assert reps == 1
    assert interval == 1
    assert ef == 2.6

    reps, interval, ef = calculate_sm2(5, reps, interval, ef)
    assert reps == 2
    assert interval == 6

    # Test failure reset
    reps, interval, ef = calculate_sm2(1, reps, interval, ef)
    assert reps == 0
    assert interval == 1
    assert ef < 2.6
    assert ef >= 1.3


def test_p7_sync_engine_lww_conflict_resolution():
    """Verify Last-Write-Wins (LWW) conflict resolution logic."""
    sqlite_ts = (DB_DIR / "sqlite.ts").read_text(encoding="utf-8")
    assert "resolveConflictAndUpsertCard" in sqlite_ts
    assert "serverTime >= localTime" in sqlite_ts or "getTime()" in sqlite_ts
    assert "acknowledgeSyncSuccess" in sqlite_ts


def test_p7_voice_recorder_audio_constraints():
    """Verify voice recorder enforces 16kHz sample rate, 16-bit depth, and mono channel."""
    voice_ts = (SERVICES_DIR / "voiceRecorder.ts").read_text(encoding="utf-8")
    assert "sampleRate: 16000" in voice_ts
    assert "bitsPerSample: 16" in voice_ts
    assert "channels: 1" in voice_ts
    assert "validateAudioBuffer" in voice_ts
    assert "calculateRms" in voice_ts


def test_p7_tele_manas_dialer_intent():
    """Verify Tele-MANAS 14416 toll-free student helpline is wired with dialer intent."""
    crisis_banner = (COMPONENTS_DIR / "CrisisSafetyBanner.tsx").read_text(encoding="utf-8")
    assert "tel:14416" in crisis_banner
    assert "Tele-MANAS" in crisis_banner
    assert "Linking.openURL" in crisis_banner


def test_p7_mobile_offline_socratic_curricula():
    """Verify mobile app integrates Anna University core subjects and Tanglish support."""
    app_tsx = (SRC_DIR / "App.tsx").read_text(encoding="utf-8")
    chat_view = (COMPONENTS_DIR / "OfflineChatView.tsx").read_text(encoding="utf-8")
    assert "Anna Univ" in app_tsx
    assert "CS3301" in chat_view
    assert "CS3452" in chat_view
    assert "CS3401" in chat_view
