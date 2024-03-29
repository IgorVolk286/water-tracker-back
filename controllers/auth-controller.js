import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import User from "../models/User.js";
import { HttpError, sendEmail } from "../helpers/index.js";
import { ctrlWrapper } from "../decorators/index.js";
import fs from "fs/promises";
import path from "path";
import gravatar from "gravatar";
import { nanoid } from "nanoid";
import cloudinary from "../helpers/cloudinary.js";

const { JWT_SECRET, BASE_URL } = process.env;

const signup = async (req, res) => {
  const { email, password } = req.body;

  const avatarURL = gravatar.url(email, { s: "100", r: "x", d: "retro" }, true);
  const user = await User.findOne({ email });
  if (user) {
    throw HttpError(409, "Email in use");
  }
  const hashPassword = await bcrypt.hash(password, 10);
  const verificationToken = nanoid();
  const newUser = await User.create({
    email,
    name: `User_${Date.now()}`,
    avatarURL,
    password: hashPassword,
    verificationToken,
  });
  res.status(201).json({
    email: newUser.email,
    avatarURL,
  });

  const verifyEmail = {
    to: email,
    subject: "Verify email",
    html: `<a target="_blank" href="${BASE_URL}/api/users/verify/${verificationToken}">Click ferify email</a>`,
  };
  await sendEmail(verifyEmail);

  res.status(201).json({
    email: newUser.email,
    avatarURL,
  });
};
const verify = async (req, res) => {
  const { verificationToken } = req.params;
  const user = await User.findOne({ verificationToken });
  if (!user) {
    throw HttpError(404, "User not found");
  }
  await User.findByIdAndUpdate(user._id, {
    verify: true,
    verificationToken: null,
  });
  res.json({
    message: "Verification successful",
  });
};

const resendVerify = async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });

  if (!user) {
    throw HttpError(404, "Email not found");
  }
  if (user.verify) {
    throw HttpError(409, "Verification has already been passed");
  }
  const verifyEmail = {
    to: email,
    subject: "Verify email",
    html: `<a target="_blank" href="${BASE_URL}/api/users/verify/${user.verificationToken}">Click ferify email</a>`,
  };
  await sendEmail(verifyEmail);
  res.json({
    message: "Email send success",
  });
};

const signin = async (req, res) => {
  const { email, password } = req.body;

  const user = await User.findOne({ email });

  if (!user) {
    throw HttpError(401, "Email or password is wrong");
  }

  if (!user.verify) {
    throw HttpError(401, "Email or password is wrong");
  }
  const passwordCompare = await bcrypt.compare(password, user.password);

  if (!passwordCompare) {
    throw HttpError(401, "Email or password is wrong");
  }

  const paylod = {
    id: user._id,
  };
  const avatarURL = user.avatarURL;
  const token = jwt.sign(paylod, JWT_SECRET, { expiresIn: "24h" });
  await User.findByIdAndUpdate(user._id, { token });
  res.json({
    token,
    user: {
      email: user.email,
      name: user.name,
      dailyNorma: user.dailyNorma,
      gender: user.gender,
    },
    avatarURL,
  });
};

const getCurrent = async (req, res) => {
  const { email, avatarURL, _id, name, gender, dailyNorma } = req.user;
  res.json({ email, avatarURL, _id, name, gender, dailyNorma });
};

const logout = async (req, res) => {
  const { _id } = req.user;
  await User.findByIdAndUpdate(_id, { token: "" });
  res.status(204).json({});
};

const dailyNormaUpdate = async (req, res) => {
  const { _id } = req.user;
  const { dailyNorma } = req.body;

  if (!dailyNorma) {
    throw HttpError(400, "Enter your dailyNorma");
  }
  await User.findByIdAndUpdate(_id, req.body);
  res.json({
    dailyNorma,
  });
};

const settings = async (req, res) => {
  let { password } = req.body;

  const passwordCompare = await bcrypt.compare(password, req.user.password);
  if (!passwordCompare) {
    throw HttpError(400, "Password is wrong");
  }
  const { newPassword } = req.body;
  password = newPassword
    ? await bcrypt.hash(newPassword, 10)
    : req.user.password;

  const result = await User.findOneAndUpdate(
    req.user._id,
    { ...req.body, password },
    {
      new: true,
      runValidators: true,
    }
  );
  const { email, avatarURL, name, gender, dailyNorma } = result;
  res.json({ email, avatarURL, name, gender, dailyNorma });
};

const updateAvatar = async (req, res) => {
  if (!req.file) {
    throw HttpError(400, "No file");
  }
  const { url: avatarURL } = await cloudinary.uploader.upload(req.file.path, {
    folder: "avatars",
  });
  fs.unlink(req.file.path);
  await User.findByIdAndUpdate(req.user._id, {
    avatarURL,
  });
  res.json({ avatarURL });
};

const forgetPassword = async (req, res) => {
  const { email } = req.body;
  const user = await User.findOne({ email });

  if (!user) {
    throw HttpError("404", "User not registered");
  }
  const recoveryPassword = nanoid();
  const recoveryPasswordHash = await bcrypt.hash(recoveryPassword, 10);

  const recoveryPasswordMail = {
    to: email,
    subject: "Recovery password",
    text: `Your new password ${recoveryPassword}`,
  };

  await sendEmail(recoveryPasswordMail);

  await User.findByIdAndUpdate(user._id, { password: recoveryPasswordHash });

  res.status(200).json({
    message: "Password recovery ",
  });
};

const recovery = async (req, res) => {
  const { newPassword, repeatPassword, email } = req.body;

  const user = await User.findOne({ email });
  if (!user) {
    throw HttpError(404, "Email not found");
  }

  if (!user.verify) {
    throw HttpError(401, "Email is wrong");
  }

  const hashpassword = await bcrypt.hash(newPassword, 10);

  await User.findByIdAndUpdate(user._id, { password: hashpassword });

  res.status(200).json({
    message: "Password recovery ",
  });
};

export default {
  signup: ctrlWrapper(signup),
  verify: ctrlWrapper(verify),
  resendVerify: ctrlWrapper(resendVerify),
  signin: ctrlWrapper(signin),
  getCurrent: ctrlWrapper(getCurrent),
  logout: ctrlWrapper(logout),
  settings: ctrlWrapper(settings),
  forgetPassword: ctrlWrapper(forgetPassword),
  recovery: ctrlWrapper(recovery),
  updateAvatar: ctrlWrapper(updateAvatar),
  dailyNormaUpdate: ctrlWrapper(dailyNormaUpdate),
};
