from flask import Flask, request
from twilio.twiml.messaging_response import MessagingResponse


def build_reply(incoming_text):
    # Return the reply text based on the incoming message
    text = incoming_text.strip().lower()
    if text == "c":
        return "Appointment confirmed. Thank you!"
    if text == "r":
        return "Please send your preferred new time."
    if "rop" in text:
        return "Checking items below ROP..."
    return "Send 'items below ROP' to get the report."


def create_app():
    # Build the Flask app with the WhatsApp webhook route
    app = Flask(__name__)

    @app.route("/whatsapp", methods=["POST"])
    def whatsapp_webhook():
        incoming = request.form.get("Body", "")
        resp = MessagingResponse()
        resp.message(build_reply(incoming))
        return str(resp)

    return app


def main():
    # Run the server on port 5000
    create_app().run(port=5000)


if __name__ == "__main__":
    main()
