# Short 1.1: How does a robot see?

**Format:** vertical 1080 × 1920, about 70 s, one idea.
**Idea:** a camera gives a robot numbers, not things. Turning those numbers into an understanding of the world is perception.
**Shape:** hook, surprise, grayscale grid, colour channels, scale, the hard part, the name, the stakes, sign-off.

Times are where each visual starts in the current silent cut. Read naturally; the video will be retimed to the recording.

| # | Time | On screen | Voiceover |
|---|---|---|---|
| 1 | 0:00 | Cover: "How does a robot see?" | You see three drones. A robot sees nothing like that. |
| 2 | 0:06 | Camera doodle, then the drone room; "We see three drones." | Point a camera at this room, and what the robot actually receives is a grid of numbers. |
| 3 | 0:12 | Photo turns grayscale; "grayscale" pill | First, take away the colour. |
| 4 | 0:14 | Zoom on one drone; 6 × 6 grid, "just numbers" | Zoom in on one drone. Every pixel is just a brightness... |
| 5 | 0:19 | Brightness bar: 0 · black to 255 · white | ...from zero for black to two hundred fifty-five for white. |
| 6 | 0:22 | Grid tilts into perspective and splits into red, green and blue layers | A colour image is three of these grids stacked together: red, green and blue. |
| 7 | 0:25 | One pixel highlighted through all three layers: (37, 39, 31) | So every colour pixel is three numbers. |
| 8 | 0:28 | Layers fold back into one flat colour image | Put them back together, and you get the picture. |
| 9 | 0:30 | Counters: 6,220,800 and 186,624,000 | One full-HD frame holds over six million numbers. At thirty frames a second, that's nearly two hundred million, every single second. |
| 10 | 0:37 | "And not one of them says “drone”." | And not one of them says "drone". |
| 11 | 0:40 | "The robot must *Understand,* / Before it can *Act.*" over the room | The robot must understand before it can act. |
| 12 | 0:41 | Edges, then boxes, then near / middle / far tags | It looks for edges where the brightness jumps, shapes that add up to objects, and clues to how far away each one is. |
| 13 | 0:51 | Pixels → edges → objects → decision; "perception · turning numbers into meaning" | That leap, from raw numbers to an understanding of the world, is called perception. |
| 14 | 0:58 | Drone flies through the gap; see → understand → act | Without it, a robot can't find the gap, dodge an obstacle, or land. With it, it can. |
| 15 | 1:05 | End card: "Read more at perception.praisecu.com" | To learn more, read Fundamentals of Robot Perception, from the PRAISe Lab. |

## Fact check

- **0 to 255.** 8-bit pixel values. The grid shows real values from the render: the brightness of each small patch, averaged over its pixels.
- **Three channels.** The red, green and blue layers are the same patch's channel averages, so the highlighted pixel (37, 39, 31) is a dark grey-green from the drone's body.
- **6,220,800 numbers per frame.** 1920 × 1080 pixels × 3 colour channels.
- **186,624,000 numbers per second.** 6,220,800 × 30, so "nearly two hundred million".
- **Edges, objects, distance.** A simplified view, which the chapter also uses. Modern networks learn these steps together, but they still have to recover the same information.
