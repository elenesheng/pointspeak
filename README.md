<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# SpaceVision

AI-powered interior design app. Point at a room image and describe changes—the app uses Google Gemini to edit the space (style transfer, object swap, surface changes) and keeps full undo/redo.

## Run locally

**Prerequisites:** Node.js 18+

1. **Install**
   ```bash
   npm install
   ```

2. **Configure**  
   Create `.env.local` and set at least:
   - `GEMINI_API_KEY` — your [Google AI Studio](https://aistudio.google.com/apikey) API key  

3. **Start**
   ```bash
   npm run dev
   ```
   Open [http://localhost:3000](http://localhost:3000).

## Scripts

| Command         | Description        |
|-----------------|--------------------|
| `npm run dev`   | Start dev server   |
| `npm run build` | Production build   |
| `npm run start` | Run production app |
