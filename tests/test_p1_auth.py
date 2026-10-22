"""NEURA AI — Phase P1 Acceptance Tests: Authentication, User Lifecycle, and Session Token Rotation.

Verifies:
- POST /auth/register (Argon2id hashing, unique emails, validation)
- POST /auth/login (Credential authentication, JWT issuance)
- GET  /auth/me (Protected route verification via Bearer access token)
- POST /auth/refresh (Rotating refresh tokens, revoking old sessions)
- POST /auth/logout (Session revocation)
"""

import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

REPO_ROOT = Path(__file__).resolve().parent.parent
if str(REPO_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_ROOT))

import services.api.main as api_module


@pytest.fixture
def client() -> TestClient:
    return TestClient(api_module.app)


# ==============================================================================
# 1. REGISTRATION TESTS (/auth/register)
# ==============================================================================

def test_register_student_success(client: TestClient) -> None:
    """Verifies student registration produces 201 Created and token pair."""
    unique_email = "student_anna_univ_01@mitindia.edu"
    payload = {
        "email": unique_email,
        "password": "SecurePassword123!",
        "full_name": "Kavitha Raman",
        "college": "Madras Institute of Technology",
        "department": "Artificial Intelligence & Data Science",
        "year_of_study": 3,
    }
    response = client.post("/auth/register", json=payload)
    assert response.status_code == 201, f"Expected 201, got {response.status_code}: {response.text}"

    data = response.json()
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["token_type"] == "bearer"
    assert data["expires_in"] == 900  # 15 minutes

    user_info = data["user"]
    assert user_info["email"] == unique_email
    assert user_info["full_name"] == "Kavitha Raman"
    assert user_info["department"] == "Artificial Intelligence & Data Science"
    assert user_info["year_of_study"] == 3
    assert user_info["is_active"] is True
    assert "id" in user_info


def test_register_duplicate_email_fails(client: TestClient) -> None:
    """Verifies that duplicate registration with the same email returns 400 Bad Request."""
    unique_email = "duplicate_test@annauniv.edu"
    payload = {
        "email": unique_email,
        "password": "SecurePassword123!",
        "full_name": "Sundar C",
        "college": "College of Engineering Guindy",
        "department": "Computer Science & Engineering",
        "year_of_study": 2,
    }
    # First registration
    res1 = client.post("/auth/register", json=payload)
    assert res1.status_code == 201

    # Second registration with identical email
    res2 = client.post("/auth/register", json=payload)
    assert res2.status_code == 400
    assert "already registered" in res2.json()["detail"].lower()


def test_register_weak_password_rejected(client: TestClient) -> None:
    """Verifies password length validation (< 8 chars) triggers 422 Unprocessable Entity."""
    payload = {
        "email": "weak_pass@annauniv.edu",
        "password": "short",
        "full_name": "Test User",
    }
    response = client.post("/auth/register", json=payload)
    assert response.status_code == 422


# ==============================================================================
# 2. LOGIN TESTS (/auth/login)
# ==============================================================================

def test_login_success_and_token_generation(client: TestClient) -> None:
    """Verifies login with valid credentials returns 200 OK and fresh JWT tokens."""
    email = "login_success_student@annauniv.edu"
    password = "CorrectHorseBattery99!"

    # Register first
    client.post(
        "/auth/register",
        json={
            "email": email,
            "password": password,
            "full_name": "Arun Kumar",
            "department": "ECE",
            "year_of_study": 4,
        },
    )

    # Login
    login_response = client.post("/auth/login", json={"email": email, "password": password})
    assert login_response.status_code == 200

    tokens = login_response.json()
    assert "access_token" in tokens
    assert "refresh_token" in tokens
    assert tokens["user"]["email"] == email


def test_login_wrong_password_fails(client: TestClient) -> None:
    """Verifies login with wrong password returns 401 Unauthorized."""
    email = "wrong_pwd_user@annauniv.edu"
    password = "CorrectPassword123!"

    client.post(
        "/auth/register",
        json={
            "email": email,
            "password": password,
            "full_name": "Test Student",
        },
    )

    # Attempt login with wrong password
    response = client.post("/auth/login", json={"email": email, "password": "WrongPassword456!"})
    assert response.status_code == 401
    assert "invalid email or password" in response.json()["detail"].lower()


def test_login_nonexistent_email_fails(client: TestClient) -> None:
    """Verifies login with unregistered email returns 401 Unauthorized."""
    response = client.post("/auth/login", json={"email": "nobody_exists_here@annauniv.edu", "password": "Password123!"})
    assert response.status_code == 401


# ==============================================================================
# 3. AUTHENTICATED PROFILE TESTS (/auth/me)
# ==============================================================================

def test_get_me_with_valid_bearer_token(client: TestClient) -> None:
    """Verifies protected /auth/me returns current user profile with valid Bearer token."""
    email = "profile_check@annauniv.edu"
    password = "MySecurePassword2026!"

    reg_res = client.post(
        "/auth/register",
        json={
            "email": email,
            "password": password,
            "full_name": "Deepa Murugan",
            "department": "AI&DS",
            "year_of_study": 3,
        },
    )
    access_token = reg_res.json()["access_token"]

    # Access /auth/me with Bearer token
    headers = {"Authorization": f"Bearer {access_token}"}
    me_res = client.get("/auth/me", headers=headers)
    assert me_res.status_code == 200

    profile = me_res.json()
    assert profile["email"] == email
    assert profile["full_name"] == "Deepa Murugan"
    assert profile["department"] == "AI&DS"


def test_get_me_without_token_fails(client: TestClient) -> None:
    """Verifies protected /auth/me returns 401 Unauthorized when token is missing."""
    response = client.get("/auth/me")
    assert response.status_code == 401


def test_get_me_with_invalid_token_fails(client: TestClient) -> None:
    """Verifies /auth/me returns 401 when invalid Bearer token is passed."""
    response = client.get("/auth/me", headers={"Authorization": "Bearer invalid.jwt.signature"})
    assert response.status_code == 401


# ==============================================================================
# 4. REFRESH TOKEN ROTATION & REVOCATION TESTS (/auth/refresh, /auth/logout)
# ==============================================================================

def test_refresh_token_rotation_flow(client: TestClient) -> None:
    """Verifies rotating refresh tokens: issues new tokens and revokes previous token."""
    email = "token_rotation_user@annauniv.edu"
    password = "RotationPassword123!"

    reg_res = client.post(
        "/auth/register",
        json={
            "email": email,
            "password": password,
            "full_name": "Vignesh Shanker",
            "department": "Mechanical",
            "year_of_study": 1,
        },
    )
    initial_refresh_token = reg_res.json()["refresh_token"]

    # 1. First refresh should succeed
    refresh_res = client.post("/auth/refresh", json={"refresh_token": initial_refresh_token})
    assert refresh_res.status_code == 200

    refreshed_data = refresh_res.json()
    new_access_token = refreshed_data["access_token"]
    new_refresh_token = refreshed_data["refresh_token"]

    assert new_access_token != reg_res.json()["access_token"]
    assert new_refresh_token != initial_refresh_token

    # 2. Verify new access token works for /auth/me
    me_res = client.get("/auth/me", headers={"Authorization": f"Bearer {new_access_token}"})
    assert me_res.status_code == 200
    assert me_res.json()["email"] == email

    # 3. Old refresh token MUST now be revoked and rejected (replay attack prevention)
    stale_res = client.post("/auth/refresh", json={"refresh_token": initial_refresh_token})
    assert stale_res.status_code == 401
    assert "revoked" in stale_res.json()["detail"].lower()


def test_logout_revokes_session(client: TestClient) -> None:
    """Verifies logout revokes the refresh token and blocks further session refresh."""
    email = "logout_user@annauniv.edu"
    password = "LogoutPassword123!"

    reg_res = client.post(
        "/auth/register",
        json={
            "email": email,
            "password": password,
            "full_name": "Praveen Raj",
        },
    )
    refresh_token = reg_res.json()["refresh_token"]

    # Logout
    logout_res = client.post("/auth/logout", json={"refresh_token": refresh_token})
    assert logout_res.status_code == 200
    assert "logged out" in logout_res.json()["message"].lower()

    # Attempt to refresh with logged out token -> must fail 401
    refresh_res = client.post("/auth/refresh", json={"refresh_token": refresh_token})
    assert refresh_res.status_code == 401
