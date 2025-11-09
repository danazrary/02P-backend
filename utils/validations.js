import { body, validationResult } from "express-validator";

export const authValidations = {
  register: [
    body("name").trim().notEmpty().withMessage("Name is required"),
    body("email").optional().isEmail().withMessage("Invalid email"),
    body("mobile")
      .optional()
      .isMobilePhone()
      .withMessage("Invalid mobile number"),
    body("password")
      .isLength({ min: 6 })
      .withMessage("Password must be at least 6 characters"),
    body("city").optional().trim(),
    body("street").optional().trim(),

    // Custom validation - require email or mobile
    body().custom((value, { req }) => {
      if (!req.body.email && !req.body.mobile) {
        throw new Error("Email or mobile is required");
      }
      return true;
    }),
  ],

  login: [
    body("identifier").notEmpty().withMessage("Email or mobile is required"),
    body("password").notEmpty().withMessage("Password is required"),
  ],
};
