const jwt = require("jsonwebtoken");

const COOKIE_NAME = "bookflow_token";

const baseOptions = () => ({
  // Not readable from JavaScript -> an XSS can't steal the session.
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax",
  path: "/",
});

exports.setAuthCookie = (res, token) => {
  const { exp } = jwt.decode(token);
  res.cookie(COOKIE_NAME, token, { ...baseOptions(), expires: new Date(exp * 1000) });
};

exports.clearAuthCookie = (res) => {
  res.clearCookie(COOKIE_NAME, baseOptions());
};

exports.readAuthCookie = (req) => {
  const header = req.headers.cookie;
  if (!header) return null;
  for (const part of header.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === COOKIE_NAME) return decodeURIComponent(rest.join("="));
  }
  return null;
};
