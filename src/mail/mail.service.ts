import { Injectable, Logger } from '@nestjs/common';
import { SESv2Client, SendEmailCommand } from '@aws-sdk/client-sesv2';

@Injectable()
export class MailService {
  private logger = new Logger(MailService.name);
  private ses = new SESv2Client({ region: process.env.AWS_REGION });

  async send(to: string, subject: string, html: string, text: string) {
    // 로컬 개발용: 실제 발송 없이 로그로만 출력 (운영에서는 사용 금지)
    if (process.env.MAIL_DRIVER === 'console') {
      this.logger.log(`[MAIL:console] to=${to}\n${subject}\n${text}`);
      return;
    }
    await this.ses.send(
      new SendEmailCommand({
        FromEmailAddress: process.env.MAIL_FROM,
        Destination: { ToAddresses: [to] },
        Content: {
          Simple: {
            Subject: { Data: subject, Charset: 'UTF-8' },
            Body: {
              Html: { Data: html, Charset: 'UTF-8' },
              Text: { Data: text, Charset: 'UTF-8' },
            },
          },
        },
      }),
    );
  }
}