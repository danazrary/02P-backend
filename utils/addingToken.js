import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();
// admin token
export function adminToken(id, email, res) {


  const token = jwt.sign({ id, email, isAdmin: true }, process.env.JWT_SECRET, {
    expiresIn: "10m", // 10 minutes
  });

  res.cookie("a_t", token, {
    httpOnly: true,
    secure: false, // Set secure only in production
    sameSite: "strict",
    maxAge: 10 * 60 * 1000, // => it will expire in 10 minutes
       path: "/", // Optional: restrict to admin routes
  });

  return token;
}
//.
//.
//admin refresh token
export function adminRefreshToken(id, email, res) {
  const refreshToken = jwt.sign(
    { id, email, isAdmin: true },
    process.env.JWT_REFRESH_SECRET,
    {
      expiresIn: "1d", // 1 day
    }
  );

  res.cookie("a_rt", refreshToken, {
    httpOnly: true,
    secure: false, 
    sameSite: "strict",
    maxAge: 24 * 60 * 60 * 1000,   // 1 day 

      path: "/", 
  });

  return refreshToken;
}
//.
//.
//.
//user token
export function userToken(id, email, res) {
 

  const token = jwt.sign({ id, email, isUser: true }, process.env.JWT_SECRET, {
    expiresIn: "11m", // 11 minutes
  });

  res.cookie("u_t", token, {
    httpOnly: true,
    secure: false, // Set secure only in production
    sameSite: "strict",
    maxAge:  11 * 60 * 1000, // it will expire in 11 minutes
    path: "/", // Optional: restrict to admin routes
  });

  return token;
}
//.
//.
//user refresh token
export function userRefreshToken(id, email, res) {
  const refreshToken = jwt.sign(
    { id, email, isUser: true },
    process.env.JWT_REFRESH_SECRET,
    {
      expiresIn: "14d", // 1 day
    }
  );

  res.cookie("u_rt", refreshToken, {
    httpOnly: true,
    secure: false, // Secure in production
    sameSite: "strict",
    maxAge: 24 * 60 * 60 * 1000 * 14 , // 14 day
    path: "/", // Optional: limit token to admin routes
  });

  return refreshToken;
}
//.
//.
//.
//seller token
export function sellerToken(id, email, res) {


  const token = jwt.sign({ id, email, isSeller: true }, process.env.JWT_SECRET, {
    expiresIn: "11m", // 11 minutes
  });

  res.cookie("s_t", token, {
    httpOnly: true,
    secure: false, // Set secure only in production
    sameSite: "strict",
    maxAge:  24 * 60 * 60 * 1000, // it will expire in 24 hours
    path: "/", // Optional: restrict to admin routes
  }); 

  return token;
}
export function shortSellerToken(id, info, res) {
  const token = jwt.sign({ id, info, isSeller: true }, process.env.JWT_SECRET, {
    expiresIn: "3m", // 3 minutes
  });


  return token;
}
//.
//.
//.
//seller refresh token
export function sellerRefreshToken(id, email, res) {
  const refreshToken = jwt.sign(
    { id, email, isSeller: true },
    process.env.JWT_REFRESH_SECRET,
    {
      expiresIn: "14d", // 1 day
    }
  );

  res.cookie("s_rt", refreshToken, {
    httpOnly: true,
    secure: false, // Secure in production
    sameSite: "strict",
    maxAge: 24 * 60 * 60 * 1000 * 14 , // 14 day
    path: "/", // Optional: limit token to admin routes
  });

  return refreshToken;
}
//.
//.
//.
//.
// verify path token
export function userVerifyPathToken(id, email, res) {
  

  const token = jwt.sign({ id, email, isUser: true }, process.env.JWT_SECRET, {
    expiresIn: "10m", // 11 minutes
  });

  res.cookie("uac_t", token, {
    httpOnly: true,
    secure: false, // Set secure only in production
    sameSite: "strict",
    maxAge: 10 * 60 * 1000, // it will expire in 11 minutes
    path: "/", // Optional: restrict to admin routes
  });

  return token;
}
export function sellerVerifyPathToken(id, email, res) {
  const token = jwt.sign({ id, email, isSeller: true }, process.env.JWT_SECRET, {
    expiresIn: "10m", // 11 minutes
  });

  res.cookie("sac_t", token, {
    httpOnly: true,
    secure: false, // Set secure only in production
    sameSite: "strict",
    maxAge: 10 * 60 * 1000, // it will expire in 11 minutes
    path: "/", // Optional: restrict to admin routes
  });

  return token;
}
export function sellerFPPathToken(id, email, res) {
  const token = jwt.sign(
    { id, email, isSeller: true },
    process.env.JWT_SECRET,
    {
      expiresIn: "10m", // 11 minutes
    }
  );

  res.cookie("s_fp_t", token, {
    httpOnly: true,
    secure: false, // Set secure only in production
    sameSite: "strict",
    maxAge: 10 * 60 * 1000, // it will expire in 11 minutes
    path: "/", // Optional: restrict to admin routes
  });

  return token;
}