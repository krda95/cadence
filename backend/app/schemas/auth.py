from pydantic import BaseModel, EmailStr, Field


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class LoginResponse(BaseModel):
    access_token: str
    refresh_token: str
    expires_in: int
    token_type: str


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    username: str = Field(min_length=2, max_length=50)


class RegisterResponse(BaseModel):
    user_id: str
    email: EmailStr
    email_confirmation_required: bool


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ChangePasswordRequest(BaseModel):
    current_password: str = Field(min_length=1)
    new_password: str = Field(min_length=8)


class MessageResponse(BaseModel):
    message: str


class ResetPasswordRequest(BaseModel):
    access_token: str
    password: str = Field(min_length=8)


class RefreshTokenRequest(BaseModel):
    refresh_token: str = Field(min_length=1)
