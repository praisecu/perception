# Short 1.1: How does a robot see?

**Format:** vertical 1080 × 1920, about 40 s, one idea.
**Idea:** a camera gives a robot numbers, not things. Turning those numbers into an understanding of the world is perception.
**Shape:** hook (0 to 3 s), surprise, scale, the hard part, the name, the stakes, sign-off.

The video will be retimed to the recorded voice, so read naturally; times are targets.

| # | Target | On screen | Voiceover |
|---|---|---|---|
| 1 | 0:00 | Cover: "How does a robot see?" | You see three drones. A robot sees... nothing like that. |
| 2 | 0:04 | Camera doodle, then the drone room | Point a camera at this room, and what the robot actually receives is a grid of numbers. |
| 3 | 0:09 | Zoom into one drone; a 6 × 6 grid of pixel values | Zoom in on one drone. Every pixel is just a brightness, from zero for black to two hundred fifty-five for white. |
| 4 | 0:15 | Counters: 6,220,800 and 186,624,000 | One full-HD frame holds over six million of these. At thirty frames a second, that's nearly two hundred million numbers, every single second. |
| 5 | 0:22 | Pill: "no number says drone" | And not one of them says "drone". |
| 6 | 0:24 | Edges appear, then boxes: near, middle, far | So the robot has to find the meaning itself: edges where the brightness jumps, shapes that add up to objects, and clues to how far away each one is. |
| 7 | 0:31 | Pixels → edges → objects → decision; "perception" | That leap, from raw numbers to an understanding of the world, is called perception. |
| 8 | 0:35 | Drone flies through the gap | Without it, a robot can't find the gap, dodge the obstacle, or land. With it, it can. |
| 9 | 0:40 | End card | Fundamentals of Robot Perception. Chapter one. |

## Fact check

- **6,220,800 numbers per frame.** 1920 × 1080 pixels × 3 colour channels (red, green, blue).
- **186,624,000 numbers per second.** 6,220,800 × 30, so "nearly two hundred million".
- **0 to 255.** 8-bit pixel values. The grid in the video shows real values from the render: the brightness of each small patch, averaged over its pixels.
- **Edges, objects, distance.** A simplified view, which the chapter also uses. Modern networks learn these steps together, but they still have to recover the same information.
