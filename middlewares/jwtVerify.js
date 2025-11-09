// verifey jwt token

import jwt from "jsonwebtoken";

export const jwtVerfyAdminToken = (req, res, next) => {
  const { a_t } = req.cookies;

  if (!a_t) {
    return res.status(401).json({
      token: "null",
      refreshtoken: "null",
      errorMsg: "Please login first",
      error: true,
    });
  }

  jwt.verify(a_t, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({
          token: "expired",
          errorMsg: "Session expired. Please login again.",
          error: true,
        });
      }

      return res.status(401).json({
        token: "null",
        refreshtoken: "null",
        errorMsg: "Please login first",
        err: err,
        error: true,
      });
    }

    /*   if (!user.isAdmin) {
 
      return res.status(403).json({
        errorMsg: "Admin access required",
        error: true,
      });
    }
 */
    req.admin = user;
    next();
  });
};

export const jwtVerfyAdminRefreshToken = (req, res, next) => {
  const { a_rt } = req.cookies;

  if (!a_rt) {
    res.cookie("a_t", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "Strict",
      expires: new Date(0),
    });

    return res.status(401).json({
      success: false,
      error: true,
      msg: "Please login first",
    });
  }

  jwt.verify(a_rt, process.env.JWT_REFRESH_SECRET, (err, user) => {
    if (err) {
      res.cookie("a_t", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "Strict",
        expires: new Date(0),
      });
      res.cookie("a_rt", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "Strict",
        expires: new Date(0),
      });

      return res.status(401).json({
        errorMsg: "Please login first",
        logout: true,
      });
    }

    if (!user.isAdmin) {
      return res.status(403).json({
        errorMsg: "Admin access required",
        error: true,
      });
    }

    req.admin = user;
    next();
  });
};
//.
//.
//.
//user token
export const jwtVerfyUserToken = (req, res, next) => {
  const { u_t } = req.cookies;

  if (!u_t) {
    res.cookie("u_rt", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "development",
      sameSite: "Strict",
      expires: new Date(0),
    });

    return res.status(401).json({
      token: "null",
      refreshtoken: "null",
      errorMsg: "سەرەتا کرداریی چوونەژوورەوە ئەنجام بدە",
      error: true,
    });
  }

  jwt.verify(u_t, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({
          token: "expired",
          errorMsg: "Session expired. Please login again.",
          error: true,
        });
      }

      return res.status(401).json({
        token: "null",
        refreshtoken: "null",
        errorMsg: "تکایە دووبارە کرداریی چوونەژوورەوە ئەنجام بدە",
        err: err,
        error: true,
      });
    }

    req.user = user;
    next();
  });
};

export const jwtVerfyUserRefreshToken = (req, res, next) => {
  const { u_rt } = req.cookies;


  if (!u_rt) {
    res.cookie("a_t", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "development",
      sameSite: "Strict",
      expires: new Date(0),
    });

    return res.status(401).json({
      errorMsg: "سەرەتا کرداریی چوونەژوورەوە ئەنجام بدە",
      logout: true,
    });
  }

  jwt.verify(u_rt, process.env.JWT_REFRESH_SECRET, (err, user) => {
    if (err) {
      res.cookie("u_t", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "development",
        sameSite: "Strict",
        expires: new Date(0),
      });
      res.cookie("u_rt", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "development",
        sameSite: "Strict",
        expires: new Date(0),
      });

      return res.status(401).json({
        errorMsg: "سەرەتا کرداریی چوونەژوورەوە ئەنجام بدە",
        logout: true,
      });
    }
    // check this if it is not working
    if (!user.isUser) {
      return res.status(403).json({
        errorMsg: "هەڵەێک ڕوویدا",
        error: true,
      });
    }

    req.user = user;
    next();
  });
};
//.
//.
//.
//seller token
export const jwtVerfySellerToken = (req, res, next) => {
  const { s_t } = req.cookies;

  if (!s_t) {
    res.cookie("s_rt", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "development",
      sameSite: "Strict",
      expires: new Date(0),
    });

    return res.status(401).json({
      token: "null",
      refreshtoken: "null",
      errorMsg: "سەرەتا کرداریی چوونەژوورەوە ئەنجام بدە",
      error: true,
    });
  }

  jwt.verify(s_t, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({
          token: "expired",
          errorMsg: "Session expired. Please login again.",
          error: true,
        });
      }

      return res.status(401).json({
        token: "null",
        refreshtoken: "null",
        errorMsg: "تکایە دووبارە کرداریی چوونەژوورەوە ئەنجام بدە",
        err: err,
        error: true,
      });
    }

    req.user = user;
    next();
  });
};

export const jwtVerfySellerRefreshToken = (req, res, next) => {
  const { s_rt } = req.cookies;
 
  if (!s_rt) {
   

    res.cookie("s_t", "", {
      httpOnly: true,
      secure: process.env.NODE_ENV === "development",
      sameSite: "Strict",
      expires: new Date(0),
    });

    return res.status(401).json({
      errorMsg: "سەرەتا کرداریی چوونەژوورەوە ئەنجام بدە",
      logout: true,
    });
  }

  jwt.verify(s_rt, process.env.JWT_REFRESH_SECRET, (err, user) => {
    if (err) {
    
      res.cookie("s_t", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "development",
        sameSite: "Strict",
        expires: new Date(0),
      });
      res.cookie("s_rt", "", {
        httpOnly: true,
        secure: process.env.NODE_ENV === "development",
        sameSite: "Strict",
        expires: new Date(0),
      });

      return res.status(401).json({
        errorMsg: "سەرەتا کرداریی چوونەژوورەوە ئەنجام بدە",
        logout: true,
      });
    }
    // check this if it is not working
   

    if (!user.isSeller) {
   
      return res.status(403).json({
        errorMsg: "هەڵەێک ڕوویدا",
        error: true,
      });
    }

    req.user = user;
  

    next();
  });
};
//.
//.
//.
//user verify path token
export const jwtVerifyUVPT = (req, res, next) => {
  const { uac_t } = req.cookies;

  if (!uac_t) {
    return res.status(401).json({
      token: "null",
      refreshtoken: "null",
      errorMsg: "تکایە دواتر هەوڵبدەوە",
      error: true,
    });
  }

  jwt.verify(uac_t, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({
          token: "expired",
          errorMsg: "کیشەێک هەیە تکایە بگەریەوە بۆ پەڕی سەرەکی",
          error: true,
        });
      }

      return res.status(401).json({
        token: "null",
        refreshtoken: "null",
        errorMsg: "سەرەتا کرداریی چوونەژوورەوە ئەنجام بدە",
        err: err,
        error: true,
      });
    }

    req.user = user;
    next();
  });
};
//.
//.
//.
//user verify path token
export const jwtVerifySVPT = (req, res, next) => {
  const { sac_t } = req.cookies;

  if (!sac_t) {
    return res.status(401).json({
      token: "null",
      refreshtoken: "null",
      errorMsg: "تکایە دواتر هەوڵبدەوە",
      error: true,
    });
  }

  jwt.verify(sac_t, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({
          token: "expired",
          errorMsg: "کیشەێک هەیە تکایە بگەریەوە بۆ پەڕی سەرەکی",
          error: true,
        });
      }

      return res.status(401).json({
        token: "null",
        refreshtoken: "null",
        errorMsg: "سەرەتا کرداریی چوونەژوورەوە ئەنجام بدە",
        err: err,
        error: true,
      });
    }

    req.user = user;
    next();
  });
};
export const jwt_FP_SVPT = (req, res, next) => {
  const { s_fp_t } = req.cookies;

  if (!s_fp_t) {
    return res.status(401).json({
      token: "null",
      refreshtoken: "null",
      errorMsg: "تکایە دواتر هەوڵبدەوە",
      error: true,
    });
  }

  jwt.verify(s_fp_t, process.env.JWT_SECRET, (err, user) => {
    if (err) {
      if (err.name === "TokenExpiredError") {
        return res.status(401).json({
          token: "expired",
          errorMsg: "کیشەێک هەیە تکایە بگەریەوە بۆ پەڕی سەرەکی",
          error: true,
        });
      }

      return res.status(401).json({
        token: "null",
        refreshtoken: "null",
        errorMsg: "سەرەتا کرداریی چوونەژوورەوە ئەنجام بدە",
        err: err,
        error: true,
      });
    }

    req.user = user;
    next();
  });
};
