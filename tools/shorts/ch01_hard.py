"""Chapter 1 short 2: "Why is seeing so hard?"

Story: every pixel is a ray, so size and distance trade off; light changes
every number; and a camera flattens 3D into 2D. The image is only a clue.

Render: manim -qh --format mp4 ch01_hard.py Hard
"""
import numpy as np
from PIL import Image

from short_style import *

SCENE = ASSETS / "scene.jpg"


class Hard(Scene):
    def construct(self):
        play_cover(self, "Chapter 1 · Introduction", "Why is seeing", "so hard?",
                   "Your brain makes it look easy.", image=ASSETS / "forced_0.jpg")

        # ---------- Beat A: every pixel is a ray (3 to 11 s) ----------
        cap = say("Every pixel is a ray.", 54).move_to(UP * 5.3)
        cam = camera_doodle(0.7).rotate(-PI / 2).move_to(LEFT * 3.5 + UP * 1.2)
        apex = cam.get_right() + RIGHT * 0.05
        far_x = 4.2
        top = apex + np.array([far_x - apex[0], 1.9, 0])
        bot = apex + np.array([far_x - apex[0], -1.9, 0])
        ray_t = DashedLine(apex, top, dash_length=0.14).set_stroke(GOLD, 4)
        ray_b = DashedLine(apex, bot, dash_length=0.14).set_stroke(GOLD, 4)
        self.play(Write(cap), Create(cam), run_time=0.9)
        self.play(Create(ray_t), Create(ray_b), run_time=0.8)

        def span_at(x):
            return 2 * 1.9 * (x - apex[0]) / (far_x - apex[0])

        x_small, x_big = -1.0, 2.9
        small = drone_doodle(1).set_width(span_at(x_small) * 0.95).move_to([x_small, apex[1], 0])
        big = drone_doodle(1).set_width(span_at(x_big) * 0.95).move_to([x_big, apex[1], 0])
        q1 = say("Small and near?", 50).move_to(DOWN * 3.0)
        q2 = say("Or big and far?", 50, GOLD).next_to(q1, DOWN, buff=0.35)
        self.play(FadeIn(small, scale=0.6), Write(q1), run_time=0.8)
        self.play(FadeIn(big, scale=0.6), Write(q2), run_time=0.8)
        same = pill("same pixels", size=40).next_to(q2, DOWN, buff=0.6)
        self.play(FadeIn(same, shift=UP * 0.2), Indicate(small, color=GOLD), Indicate(big, color=GOLD), run_time=1.0)
        self.wait(1.4)

        # ---------- Beat B: forced perspective (11 to 19 s) ----------
        self.play(FadeOut(VGroup(cap, cam, ray_t, ray_b, small, big, q1, q2, same)), run_time=0.5)
        cap2 = say("These two look the same size.", 48).move_to(UP * 5.3)
        img = ImageMobject(str(ASSETS / "forced_0.jpg")).set_width(7.0).move_to(UP * 2.9)
        frame = rough_box(img.width + 0.12, img.height + 0.12, INK, 4, radius=0.1).move_to(img)
        self.play(Write(cap2), FadeIn(img, scale=0.95), Create(frame), run_time=0.9)
        self.wait(0.6)

        # Top view, from forced.json: camera at the origin, small drone (0.5 m) at
        # (-0.45, 2), big drone (1.5 m) at (1.35, 6).
        k = 0.72
        origin = np.array([0, -6.3, 0])
        def tv(x, y):
            return origin + np.array([x * k * 1.6, y * k, 0])
        tv_lab = kicker("Seen from above", 26).next_to(img, DOWN, buff=0.35)
        cam_dot = Triangle().scale(0.22).set_fill(GOLD, 1).set_stroke(width=0).move_to(tv(0, 0))
        s_d = drone_doodle(1).set_width(0.5 * k * 1.6).move_to(tv(-0.45, 2))
        b_d = drone_doodle(1).set_width(1.5 * k * 1.6).move_to(tv(1.35, 6))
        sight = VGroup(DashedLine(tv(0, 0), tv(-0.45, 2) * 1 + (tv(-0.45, 2) - tv(0, 0)) * 2.05, dash_length=0.12),
                       DashedLine(tv(0, 0), tv(1.35, 6), dash_length=0.12)).set_stroke(MUTED, 2)
        l_s = mono("0.5 m · 2 m away", 24, INK).next_to(s_d, LEFT, buff=0.3)
        l_b = mono("1.5 m · 6 m away", 24, INK).next_to(b_d, RIGHT, buff=0.25)
        if l_b.get_right()[0] > 4.3:
            l_b.next_to(b_d, DOWN, buff=0.2)
        self.play(FadeIn(tv_lab), FadeIn(cam_dot), Create(sight), run_time=0.6)
        self.play(FadeIn(s_d, scale=0.5), FadeIn(l_s), run_time=0.6)
        self.play(FadeIn(b_d, scale=0.5), FadeIn(l_b), run_time=0.6)
        cap3 = say("One is 3× bigger and 3× farther.", 46, GOLD)
        fit(cap3, 8.4).move_to(cap2)
        self.play(ReplacementTransform(cap2, cap3), run_time=0.6)
        self.wait(1.6)

        # ---------- Beat C: light changes every number (19 to 27 s) ----------
        self.play(FadeOut(Group(cap3, img, frame, tv_lab, cam_dot, s_d, b_d, sight, l_s, l_b)), run_time=0.5)
        cap4 = say("Now dim the lights.", 54).move_to(UP * 5.3)
        rgb = np.asarray(Image.open(SCENE).convert("RGB"), dtype=float)
        x0, y0, cw = 760, 300, 300
        crop = rgb[y0:y0 + 170, x0:x0 + cw]
        bright = np.clip(crop * 1.35, 0, 255).astype(np.uint8)
        dim = np.clip(crop * 0.38, 0, 255).astype(np.uint8)
        Image.fromarray(bright).save(ASSETS / "light_bright.png")
        Image.fromarray(dim).save(ASSETS / "light_dim.png")
        cols = Group()
        for path, arr, name in ((ASSETS / "light_bright.png", bright, "bright"), (ASSETS / "light_dim.png", dim, "dim")):
            im = ImageMobject(str(path)).set_width(3.7)
            fr = rough_box(im.width + 0.1, im.height + 0.1, INK, 3, radius=0.08).move_to(im)
            g = arr.mean(axis=2)
            cells = VGroup()
            for r in range(3):
                for c in range(3):
                    v = int(g[60 + r * 12:72 + r * 12, 120 + c * 12:132 + c * 12].mean())
                    sq = Square(1.05).set_stroke("#2c2b28", 2).set_fill(rgb_to_color([v / 255] * 3), 1)
                    cells.add(VGroup(sq, mono(str(v), 30, "#111111" if v > 120 else INK).move_to(sq)))
            cells.arrange_in_grid(3, 3, buff=0)
            for cc in cells:
                cc[1].move_to(cc[0])
            lab = kicker(name, 26)
            cols.add(Group(lab, Group(im, fr), cells).arrange(DOWN, buff=0.35))
        cols.arrange(RIGHT, buff=0.5).move_to(UP * 0.6)
        self.play(Write(cap4), FadeIn(cols[0][0]), FadeIn(cols[0][1]), FadeIn(cols[1][0]), FadeIn(cols[1][1]), run_time=0.9)
        self.play(LaggedStart(FadeIn(cols[0][2]), FadeIn(cols[1][2]), lag_ratio=0.4), run_time=0.9)
        cap5 = say("Same drone. Different numbers.", 48, GOLD)
        fit(cap5, 8.4).next_to(cols, DOWN, buff=0.8)
        self.play(Write(cap5), run_time=0.9)
        self.wait(1.6)

        # ---------- Beat D: a camera flattens the world (27 to 33 s) ----------
        self.play(FadeOut(Group(cap4, cols, cap5)), run_time=0.5)
        cap6 = say("And every photo is flat.", 54).move_to(UP * 5.3)
        s = 1.6
        f = [np.array(p) * s for p in ([-1, -1, 0], [1, -1, 0], [1, 1, 0], [-1, 1, 0])]
        d = np.array([1.3, 1.0, 0])
        b = [p + d for p in f]
        def cube_lines(back):
            lines = VGroup()
            for i in range(4):
                lines.add(Line(f[i], f[(i + 1) % 4]).set_stroke(INK, 5))
                lines.add(Line(back[i], back[(i + 1) % 4]).set_stroke(MUTED, 4))
                lines.add(Line(f[i], back[i]).set_stroke(GOLD, 4))
            return lines.move_to(UP * 1.2)
        cube = cube_lines(b)
        flat = cube_lines(f)
        self.play(Write(cap6), Create(cube), run_time=1.0)
        self.wait(0.4)
        lost = pill("depth is lost", size=40).move_to(DOWN * 2.6)
        self.play(Transform(cube, flat), FadeIn(lost, shift=UP * 0.2), run_time=1.2)
        self.wait(1.2)

        # ---------- Close (33 to 38 s) ----------
        self.play(FadeOut(VGroup(cap6, cube, lost)), run_time=0.5)
        c1 = say("So the image is", 60).move_to(UP * 2.0)
        c2 = title("only a clue.", 110, GOLD).next_to(c1, DOWN, buff=0.4)
        c3 = body("Perception is the art of reading it.", 40).next_to(c2, DOWN, buff=0.7)
        u = underline(c2, GOLD, 7)
        self.play(Write(c1), run_time=0.7)
        self.play(FadeIn(c2, shift=UP * 0.3), Create(u), run_time=0.8)
        self.play(FadeIn(c3, shift=UP * 0.2), run_time=0.6)
        self.wait(1.6)
        self.play(FadeOut(VGroup(c1, c2, c3, u)), run_time=0.5)
        play_end_card(self, "Chapter 1 · Introduction")
