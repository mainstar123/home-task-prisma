import nodemailer from "nodemailer";

export class GmailEmail {
    private transporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
            user: process.env.GMAIL_USER,
            pass: process.env.GMAIL_PASS,
        },
    });

    async sendEmail({to, subject, html}: {to: string, subject: string, html: string}) {
        const info = await this.transporter.sendMail({
            from: process.env.GMAIL_USER,
            to,
            subject,
            html,
        });
        //console.log("Message sent: %s", info.messageId);
        return info;
    }
}
