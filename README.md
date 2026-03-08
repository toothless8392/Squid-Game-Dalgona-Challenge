# Dalgona Challenge

A browser-based game inspired by the iconic dalgona candy challenge from **Squid Game** — carefully crack along the outline to extract the shape without breaking it.

## How to Play

1. Pick a shape or draw your own
2. Click along the outline to crack the candy
3. Break 99% of the outline to win
4. Break more than 18% of the interior and you lose
5. Complete it within 75 seconds

## Controls

- **Click**: Apply pressure and crack the candy at that spot
- **Lick**: Available once per game when a crack appears — lick the candy to seal it and recover

## Shapes

| Shape | Icon |
|-------|------|
| Star | ⭐ |
| Heart | ❤️ |
| Circle | ⭕ |
| Umbrella | ☂️ |
| Triangle | 🔺 |
| Custom Draw | ✏️ |

### Custom Draw Mode

- Drag the mouse to draw freely on the canvas
- Multiple strokes are supported
- Press **Done** to start the game with your drawing
- **Clear** resets the canvas, **Back** returns to shape selection

## Running

Open `dalgona/index.html` in any browser. No server or build step required.

## File Structure

```
dalgona/
├── index.html
└── js/
    ├── config.js      # Game constants
    ├── shapes.js      # Shape SDF definitions
    ├── grid.js        # Cell grid initialization and stats
    ├── crack.js       # Crack propagation logic
    ├── renderer.js    # Canvas rendering
    ├── particles.js   # Particle effects
    ├── audio.js       # Sound effects
    ├── input.js       # Mouse/touch input
    ├── game.js        # Game state management
    └── main.js        # Initialization and UI wiring
```
