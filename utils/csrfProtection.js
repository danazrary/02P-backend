import Tokens from "csrf";

const tokens = new Tokens();

// Generate a new secret
export const generateCsrfSecret = () => tokens.secretSync();

// Generate a CSRF token using the secret
export const generateCsrfToken = (secret) => tokens.create(secret);

// Verify the token using the secret
export const verifyCsrfToken = (secret, token) => tokens.verify(secret, token);





