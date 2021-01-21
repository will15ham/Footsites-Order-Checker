const got = require('got');
const { v4: uuidv4 } = require('uuid');
var tough = require('tough-cookie');

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

module.exports = class Task {
    constructor( email, orderNumber, webhook ) {
        this.email = email;
        this.orderNumber = orderNumber;
        this.webhook = webhook;
        
        this.UUID = uuidv4().toString();
        this.csrfToken;

        this.productName;
        this.orderStatus;
        this.orderDate;
        this.netAmount;
        this.trackingNumber;
    }

    async createSession(cookiejar) {
        try {
            let response = await got(`https://www.footlocker.com/api/v3/session?timestamp=${Date.now().toString()}`, {
                headers: {
                    'accept': 'application/json',
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.106 Safari/537.36',
                    'x-fl-request-id': this.UUID,
                    'sec-fetch-site': 'same-origin',
                    'sec-fetch-mode': 'cors',
                    'sec-fetch-dest': 'empty',
                    'referer': `https://www.footlocker.com`,
                    'accept-encoding': 'gzip, deflate, br',
                    'accept-language': 'en-US,en;q=0.9',
                },
                cookieJar: cookiejar
            });
            
            if (response.statusCode == 200) {
                this.csrfToken = JSON.parse(response.body).data.csrfToken;
                return;
            } else {
                console.log("Error getting CSRF Token Retrying ...");
                await sleep(4000);
                await this.createSession();
            }
        } catch {
            console.log("Error getting CSRF Token Retrying ...");
            await sleep(4000);
            await this.createSession();
        }
    }

    async checkOrder(cookiejar) {
        try {
            let response = await got.post(`https://www.footlocker.com/api/users/orders/status?timestamp=${Date.now().toString()}`, {
                headers: {
                    'accept': 'application/json',
                    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/83.0.4103.106 Safari/537.36',
                    'x-fl-request-id': this.UUID,
                    'x-csrf-token': this.csrfToken,
                    'sec-fetch-site': 'same-origin',
                    'sec-fetch-mode': 'cors',
                    'sec-fetch-dest': 'empty',
                    'referer': `https://www.footlocker.com`,
                    'accept-encoding': 'gzip, deflate, br',
                    'accept-language': 'en-US,en;q=0.9',
                },
                json: {
                    code: this.orderNumber,
                    customerEmail: this.email
                },
                cookieJar: cookiejar
            });
            
            if (response.statusCode == 200) {
                let responseBody = JSON.parse(response.body);
                this.orderStatus = responseBody.orderStatus;
                if (this.orderStatus == "Fulfilment Complete") {
                    for (let variants of responseBody.shipments) {
                        this.trackingNumber = variants.trackingNumber;
                    }
                }
                for (let variants of responseBody.lineItems) {
                    this.productName = variants.productDescription;
                }
                this.orderDate = responseBody.orderDate;
                this.netAmount = responseBody.netAmount;
                return;
            } else {
                console.log("Error Checking Order Retrying ...");
                await sleep(4000);
                await this.checkOrder();
            }
        } catch (e) {
            console.log(e)
            console.log("Error Checking Order Retrying ...");
            await sleep(4000);
            await this.checkOrder();
        }
    }

    async sendWebhook() {
        if (typeof this.trackingNumber === "undefined") {
            this.trackingNumber = "None"
        }

        try {
            await got.post(this.webhook, {
                json: {
                    "content": null,
                    "embeds": [
                      {
                        "title": "Order Status",
                        "color": 5814783,
                        "fields": [
                          {
                            "name": "Product:",
                            "value": this.productName
                          },
                          {
                            "name": "Status:",
                            "value": this.orderStatus
                          },
                          {
                            "name": "Order Date:",
                            "value": this.orderDate
                          },
                          {
                            "name": "Price:",
                            "value": this.netAmount
                          },
                          {
                            "name": "Email:",
                            "value": `||${this.email}||`
                          },
                          {
                            "name": "Order Number:",
                            "value": `||${this.orderNumber}||`
                          },
                          {
                            "name": "Tracking Number:",
                            "value": `||${this.trackingNumber}||`
                          }
                        ]
                      }
                    ]
                  }
            })
        } catch (e) {
            console.log(e.response.body)
            console.log("Error Sending Webhook Retrying ...")
        }
    }

    async initialize() {
        const cookiejar = new tough.CookieJar();

        await this.createSession(cookiejar);
        await this.checkOrder(cookiejar);
        await this.sendWebhook();
    }
}
