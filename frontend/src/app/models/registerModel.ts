export interface RegisterRequest {
  email: string;
  password: string;
  username: string;
}

export interface RegisterResponse {
  user_id: string;
  email: string;
  email_confirmation_required: boolean;
}
