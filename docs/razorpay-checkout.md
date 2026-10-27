# RedVeg Razorpay Standard Checkout

The storefront loads Razorpay Checkout.js. An authenticated customer checkout creates the RedVeg order and a Razorpay INR order using the server-calculated amount, then opens the Standard Checkout modal. The browser sends Razorpay's payment ID, order ID, and signature to the authenticated verification endpoint. RedVeg checks the signature, fetches the payment from Razorpay, validates its amount and currency, captures it if authorized, and only then marks the order paid.

## Configure the Razorpay account

1. Activate a Razorpay merchant account and complete its required business verification and settlement-bank setup.
2. In Razorpay Dashboard, create API keys. Use test keys for test-mode deployment and live keys only after the merchant account is activated.
3. Set `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` on the backend. The key ID is returned to the storefront only as part of the payment configuration; the secret stays server-only. These credentials are already present in the ignored local `.env` file in this checkout.
4. Set the same backend environment values on the deployed backend. Never put the key secret in frontend variables or source control.
5. Deploy/restart the backend after configuring the values. The storefront exposes Online payment only when all three Razorpay credentials are present. There is no RedVeg-specific ₹10 online order cap; Razorpay account and payment-method limits still apply.

## Endpoints and payment confirmation

- `POST /api/v1/orders/checkout` creates the customer order and its Razorpay order. It returns `data.razorpayCheckout` with the public key ID, Razorpay order ID, amount in paise, and currency.
- `POST /api/v1/orders/verify-payment` verifies the signature and confirms the Razorpay payment amount and currency before recording payment.
- Browser callbacks alone are not treated as proof of payment. Payment is recorded only after server-side signature verification and a server-to-server payment fetch/capture.
- The customer's profile and admin order view use the same server-side payment status.
- Razorpay hosts the payment form; RedVeg does not handle card or UPI credentials.
- Cash orders continue through the existing WhatsApp flow.

The existing SBI static QR is not part of this gateway flow. Razorpay settles to the merchant bank account configured in its dashboard; the QR/VPA does not act as a payment observer or confirmation source.
