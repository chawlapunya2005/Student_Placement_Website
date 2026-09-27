import nodemailer from "nodemailer";
const sendMail = async (to, subject, text) => {
  const transporter = nodemailer.createTransport({
    service: "gmail",
    auth: {
      user: process.env.EMAIL_USER,
      pass: process.env.EMAIL_PASS,
    },
  });

  await transporter.sendMail({
    from: `"Resume App" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    text,
  });
};

export default sendMail;
