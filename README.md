# Guitar Tuner App

A simple and effective guitar tuner built with JavaScript, HTML, and CSS. This Progressive Web App (PWA) works offline and can be installed on any device.

## Features

- **Real-time Pitch Detection:** Uses the microphone to listen and display the current note.
- **Standard Tuning:** Designed for standard EADGBe guitar tuning.
- **Responsive Design:** Works on desktop, tablet, and mobile devices.
- **PWA Ready:** Installable on your device for a native app-like experience and offline use.

## Getting Started

To run this app locally, you need to serve the files from a local web server. This is because modern browsers require a secure context (HTTPS or localhost) to access the microphone.

1.  **Clone the repository:**
    ```bash
    git clone https://github.com/your-username/GuitarTunerApp.git
    cd GuitarTunerApp
    ```

2.  **Start a local server.**
    If you have Python 3, you can run:
    ```bash
    python -m http.server
    ```
    Or, if you have Node.js, you can use a simple server package:
    ```bash
    npx serve
    ```

3.  **Open the app:**
    Open your web browser and navigate to `http://localhost:8000` (or the address provided by your server).

## Technology Stack

-   **HTML5**
-   **CSS3**
-   **JavaScript**
-   **[Pitchy.js](https://github.com/ianprime0509/pitchy)** for pitch detection.
-   **Service Worker** for PWA and offline capabilities.
