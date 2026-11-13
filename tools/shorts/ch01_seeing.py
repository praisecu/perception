"""Chapter 1 short: "How does a robot see?"

Story: a camera gives a robot numbers, not drones. Turning those numbers
into meaning is perception, and without it the robot cannot act.

Render:  manim -qh --format mp4 ch01_seeing.py Seeing
Preview: manim -ql ch01_seeing.py Seeing  (with -r 540,960)
"""
import numpy as np
from PIL import Image

from short_style import *
from short_style import HERE

SCENE = ASSETS / "scene.jpg"

# Beat and line start times from the recorded narration (prep_voice.py).
import json
VOICE = json.loads((HERE / "out" / "ch01" / "1.1-how-does-a-robot-see" / "voice.json").read_text())
B = VOICE["beats"]
S = {int(k): v for k, v in VOICE["segments"].items()}
END = VOICE["duration"]
IMG_W_PX, IMG_H_PX = 1280, 720


class Seeing(Scene):
    def px(self, img, x, y):
        """Image pixel (x, y) to scene coordinates."""
        s = img.width / IMG_W_PX
        c = img.get_center()
        return c + np.array([(x - IMG_W_PX / 2) * s, -(y - IMG_H_PX / 2) * s, 0])

    def box_on(self, img, x0, y0, x1, y1, color=GOLD, stroke=5):
        a, b = self.px(img, x0, y0), self.px(img, x1, y1)
        bx = rough_box(abs(b[0] - a[0]), abs(b[1] - a[1]), color, stroke, radius=0.08, amp=0.012)
        return bx.move_to((a + b) / 2)

    def until(self, t):
        """Wait until absolute time t in the video (no-op if already past it)."""
        dt = t - self.renderer.time
        if dt > 1 / 30:
            self.wait(dt)

    def construct(self):
        # ---------- Cover: 0 to 3 s ----------
        bg = grid_bg()
        head_bar = header_bar()
        k = kicker("Chapter 1 · Introduction", 30)
        t1 = title("How does a", 100, HEADING)
        t2 = title("robot see?", 120, GOLD)
        sub = body("It is not what you think.", 40)
        thumb = ImageMobject(str(SCENE)).set_width(7.4)
        thumb_card = card(7.8, thumb.height + 0.4)
        thumb.move_to(thumb_card)
        block = Group(k, t1, t2, sub, Group(thumb_card, thumb)).arrange(DOWN, buff=0.45).move_to(DOWN * 0.3)
        t1.shift(DOWN * 0.15); t2.shift(DOWN * 0.25); sub.shift(DOWN * 0.2); thumb_card.shift(DOWN * 0.35); thumb.shift(DOWN * 0.35)
        self.add(bg)
        self.add_foreground_mobject(head_bar)
        self.play(FadeIn(k, shift=UP * 0.2), FadeIn(t1, shift=UP * 0.3), FadeIn(t2, shift=UP * 0.3), run_time=0.7)
        self.play(FadeIn(sub, shift=UP * 0.2), FadeIn(thumb_card), FadeIn(thumb, scale=0.96), run_time=0.7)
        self.until(B[1] - 0.5)
        self.play(FadeOut(Group(k, t1, t2, sub, thumb_card, thumb), shift=UP * 0.3), run_time=0.5)

        # ---------- Beat 1: a camera looks at a room (3 to 8 s) ----------
        cam = camera_doodle(1.0).move_to(UP * 4.9)
        lab1 = say("A camera on a robot", 46).next_to(cam, UP, buff=0.45)
        img = ImageMobject(str(SCENE)).set_width(8.0).move_to(UP * 0.6)
        frame = rough_box(img.width + 0.12, img.height + 0.12, INK, 4, radius=0.1).move_to(img)
        cone = VGroup(
            DashedLine(cam.get_bottom(), frame.get_corner(UL), dash_length=0.15).set_stroke(MUTED, 3),
            DashedLine(cam.get_bottom(), frame.get_corner(UR), dash_length=0.15).set_stroke(MUTED, 3),
        )
        self.play(Create(cam), Write(lab1), run_time=1.0)
        self.play(Create(cone), run_time=0.5)
        self.play(FadeIn(img, scale=0.92), Create(frame), run_time=0.7)
        cap1 = say("We see three drones.", 52).next_to(frame, DOWN, buff=0.6)
        self.play(Write(cap1), run_time=0.8)
        self.until(B[2])

        # ---------- Beat 2: the robot sees numbers (8 to 14 s) ----------
        x0, y0, n, cell = 832, 352, 6, 9
        patch = self.box_on(img, x0, y0, x0 + n * cell, y0 + n * cell, GOLD, 5)
        cap2 = say("The robot sees...", 52).move_to(cap1)
        self.play(Create(patch), FadeOut(cap1, shift=UP * 0.2), run_time=0.6)
        self.play(Write(cap2), run_time=0.6)

        g = np.asarray(Image.open(SCENE).convert("L"), dtype=float)
        vals = [[int(g[y0 + r * cell:y0 + (r + 1) * cell, x0 + c * cell:x0 + (c + 1) * cell].mean())
                 for c in range(n)] for r in range(n)]
        cells = VGroup()
        for r in range(n):
            for c in range(n):
                v = vals[r][c]
                sq = Square(1.18).set_stroke("#2c2b28", 2).set_fill(rgb_to_color([v / 255] * 3), 1)
                num = mono(str(v), 30, "#111111" if v > 120 else INK)
                cells.add(VGroup(sq, num))
        cells.arrange_in_grid(n, n, buff=0).move_to(DOWN * 0.2)
        for sq_num in cells:
            sq_num[1].move_to(sq_num[0])
        seed = patch.copy()
        self.play(
            img.animate.set_opacity(0.0), frame.animate.set_stroke(opacity=0.0),
            FadeOut(cone), FadeOut(cam), FadeOut(lab1),
            ReplacementTransform(seed, cells), FadeOut(patch),
            run_time=1.0,
        )
        p = pill("just numbers", size=46).next_to(cells, UP, buff=0.5)
        self.play(FadeIn(p, scale=0.8), cap2.animate.next_to(p, UP, buff=0.35), run_time=0.5)
        self.until(S[4])
        bar = Rectangle(width=7.08, height=0.5).set_stroke(INK, 2)
        bar.set_fill(color=[BLACK, WHITE], opacity=1)
        bar.set_sheen_direction(RIGHT)
        bar.next_to(cells, DOWN, buff=0.7)
        b0 = mono("0 · black", 28, INK).next_to(bar, DOWN, buff=0.2).align_to(bar, LEFT)
        b1 = mono("255 · white", 28, INK).next_to(bar, DOWN, buff=0.2).align_to(bar, RIGHT)
        blab = body("Each pixel is one brightness value", 34).next_to(b0, DOWN, buff=0.35).set_x(0)
        self.play(FadeIn(bar), FadeIn(b0), FadeIn(b1), FadeIn(blab, shift=UP * 0.2), run_time=0.7)
        self.play(LaggedStart(*[Indicate(c[1], color=GOLD, scale_factor=1.25) for c in cells[::5]], lag_ratio=0.12), run_time=1.6)
        self.until(B[3] - 0.7)

        # ---------- Beat 3: how many numbers (14 to 21 s) ----------
        self.play(FadeOut(VGroup(cap2, p, bar, b0, b1, blab)), cells.animate.scale(0.42).move_to(UP * 4.6), run_time=0.7)
        l1 = mono("1920 × 1080 pixels × 3 colors", 34, INK)
        v1 = ValueTracker(0)
        n1_lab = body("numbers in one frame", 40)
        grp1 = VGroup(l1, title("0", 100, GOLD), n1_lab).arrange(DOWN, buff=0.35).move_to(UP * 1.4)
        n1 = fast_counter(v1, 100, GOLD, grp1[1].get_center())
        self.play(FadeIn(l1, shift=UP * 0.2), FadeIn(n1), run_time=0.4)
        self.play(v1.animate.set_value(6220800), Write(n1_lab), run_time=2.0, rate_func=rate_functions.ease_out_cubic)
        self.until(S[6])
        l2 = mono("× 30 frames every second", 34, INK)
        v2 = ValueTracker(0)
        n2_lab = say("numbers every second", 48)
        grp2 = VGroup(l2, title("0", 100, GOLD), n2_lab).arrange(DOWN, buff=0.35).next_to(grp1, DOWN, buff=1.0)
        n2 = fast_counter(v2, 100, GOLD, grp2[1].get_center())
        self.play(FadeIn(l2, shift=UP * 0.2), FadeIn(n2), run_time=0.4)
        self.play(v2.animate.set_value(186624000), Write(n2_lab), run_time=3.0, rate_func=rate_functions.ease_out_cubic)
        ul = underline(n2_lab, GOLD, 6)
        self.play(Create(ul), run_time=0.4)
        self.until(B[4] - 0.4)

        # ---------- Not one says "drone" ----------
        n1.clear_updaters(); n2.clear_updaters()
        self.play(FadeOut(VGroup(l1, n1, n1_lab, l2, n2, n2_lab, ul)), cells.animate.scale(1 / 0.42).move_to(DOWN * 0.6).set_opacity(0.25), run_time=0.4)
        nd1 = say("And not one of them", 56).move_to(UP * 4.6)
        nd2 = title("says “drone”.", 110, GOLD).next_to(nd1, DOWN, buff=0.35)
        fit(nd2, 7.4)
        self.play(FadeIn(nd1, shift=UP * 0.2), run_time=0.5)
        self.play(FadeIn(nd2, scale=0.9), run_time=0.6)
        self.until(B[5] - 0.6)

        # ---------- Beat 4: meaning hides in the numbers (21 to 30 s) ----------
        self.play(FadeOut(VGroup(nd1, nd2, cells)), img.animate.set_opacity(1), frame.animate.set_stroke(opacity=1), run_time=0.6)
        q = say("The robot must find the meaning.", 48).next_to(frame, UP, buff=0.6)
        fit(q, 8.4)
        self.play(Write(q), run_time=0.9)
        self.until(S[9])
        edges = ImageMobject(str(ASSETS / "edges.png")).set_width(img.width).move_to(img)
        e_p = pill("edges", size=40).next_to(frame, DOWN, buff=0.45)
        self.play(img.animate.set_opacity(0.35), FadeIn(edges), FadeIn(e_p, shift=UP * 0.2), run_time=0.8)
        self.until(S[10])
        boxes = [
            (self.box_on(img, 10, 455, 690, 705, INK), "near"),
            (self.box_on(img, 735, 330, 1065, 445, INK), "middle"),
            (self.box_on(img, 520, 292, 662, 336, INK), "far"),
        ]
        o_p = pill("objects", size=40).move_to(e_p)
        self.play(FadeOut(edges), img.animate.set_opacity(1), ReplacementTransform(e_p, o_p), run_time=0.5)
        tags = VGroup()
        for i, (bx, word) in enumerate(boxes):
            t = pill(f"drone · {word}", size=26)
            if i == 1:
                t.next_to(bx, DOWN, buff=0.08).align_to(bx, RIGHT)
            else:
                t.next_to(bx, UP, buff=0.08).align_to(bx, LEFT)
            tags.add(t)
        self.play(LaggedStart(*[Create(b) for b, _ in boxes], lag_ratio=0.25), run_time=1.1)
        self.until(S[11])
        d_p = pill("how far", size=40).move_to(o_p)
        self.play(ReplacementTransform(o_p, d_p), LaggedStart(*[FadeIn(t, shift=UP * 0.15) for t in tags], lag_ratio=0.25), run_time=1.0)
        o_p = d_p
        self.until(B[6] - 0.5)

        # ---------- Beat 5: that is perception (30 to 37 s) ----------
        stuff = Group(img, frame, edges, *[b for b, _ in boxes], tags, q, o_p)
        self.play(FadeOut(stuff), run_time=0.5)
        steps = ["pixels", "edges", "objects", "decision"]
        nodes = VGroup()
        for i, s in enumerate(steps):
            bx = rough_box(4.2, 1.1, GOLD if i == 3 else INK, 4, radius=0.2)
            tx = hand(s, 46, GOLD if i == 3 else INK).move_to(bx)
            nodes.add(VGroup(bx, tx))
        nodes.arrange(DOWN, buff=0.85).move_to(DOWN * 1.2)
        arrows = VGroup(*[rough_arrow(nodes[i].get_bottom() + DOWN * 0.08, nodes[i + 1].get_top() + UP * 0.08)
                          for i in range(3)])
        for i in range(4):
            anims = [Create(nodes[i][0]), Write(nodes[i][1])]
            if i:
                anims.insert(0, Create(arrows[i - 1]))
            self.play(*anims, run_time=0.55)
        word = title("perception", 112, GOLD).move_to(UP * 4.9)
        word.scale_to_fit_width(min(word.width, 7.4))
        wl = underline(word, GOLD, 8)
        sub = mono("turning numbers into meaning", 34, INK).next_to(wl, DOWN, buff=0.4)
        brace = BraceBetweenPoints(nodes.get_corner(UR) + RIGHT * 0.3, nodes.get_corner(DR) + RIGHT * 0.3, RIGHT).set_color(GOLD)
        self.play(Write(word), Create(brace), run_time=1.0)
        self.play(Create(wl), FadeIn(sub, shift=UP * 0.2), run_time=0.6)
        self.until(B[7] - 0.5)

        # ---------- Beat 6: no perception, no action (37 to 43 s) ----------
        self.play(FadeOut(VGroup(nodes, arrows, brace, word, wl, sub)), run_time=0.5)
        h1 = say("Without perception, a robot", 50).move_to(UP * 5.2)
        h1.scale_to_fit_width(min(h1.width, 8.0))
        h2 = title("can't act.", 92, GOLD).next_to(h1, DOWN, buff=0.35)
        wall_l = rough_box(3.0, 1.0, INK, 5, radius=0.08, fill="#3a3832", fill_opacity=1).move_to([-2.9, -0.4, 0])
        wall_r = rough_box(3.0, 1.0, INK, 5, radius=0.08, fill="#3a3832", fill_opacity=1).move_to([2.9, -0.4, 0])
        for w in (wall_l, wall_r):
            hatch = VGroup(*[Line([x, -0.85, 0], [x + 0.5, 0.05, 0]).set_stroke(MUTED, 2, 0.6)
                             for x in np.arange(-1.3, 1.0, 0.38)]).move_to(w)
            w.add(hatch)
        gap_lab = mono("gap", 30, MUTED).next_to(VGroup(wall_l, wall_r), DOWN, buff=0.25)
        drone = drone_doodle(0.75).move_to(DOWN * 5.2)
        self.play(Write(h1), Create(wall_l), Create(wall_r), FadeIn(gap_lab), FadeIn(drone, shift=UP * 0.3), run_time=1.0)
        eye = VGroup(*[DashedLine(drone.get_top(), p, dash_length=0.12).set_stroke(GOLD, 3)
                       for p in (wall_l.get_corner(DR), wall_r.get_corner(DL))])
        self.play(Create(eye), run_time=0.5)
        self.play(FadeOut(eye), drone.animate.move_to(UP * 3.0), run_time=2.2, rate_func=rate_functions.ease_in_out_sine)
        self.play(Write(h2), drone.animate.move_to(UP * 9.5), run_time=1.2, rate_func=rate_functions.ease_in_sine)
        steps2 = VGroup(hand("see", 50), hand("understand", 50), hand("act", 50, GOLD)).arrange(RIGHT, buff=1.0).move_to(DOWN * 3.4)
        ar = VGroup(rough_arrow(steps2[0].get_right() + RIGHT * 0.12, steps2[1].get_left() + LEFT * 0.12),
                    rough_arrow(steps2[1].get_right() + RIGHT * 0.12, steps2[2].get_left() + LEFT * 0.12))
        self.play(FadeOut(gap_lab), LaggedStart(Write(steps2[0]), Create(ar[0]), Write(steps2[1]), Create(ar[1]), Write(steps2[2]), lag_ratio=0.3), run_time=1.3)
        self.until(B[8] - 0.5)

        # ---------- End card (39 to 42 s) ----------
        self.play(FadeOut(Group(h1, h2, wall_l, wall_r, drone, steps2, ar)), run_time=0.5)
        e0 = kicker("An open online book", 30)
        e1 = title("Fundamentals of", 84, HEADING)
        e2 = title("Robot Perception", 96, GOLD)
        for t in (e1, e2):
            if t.width > 8.2:
                t.scale_to_fit_width(8.2)
        rule = Line(LEFT * 1.6, RIGHT * 1.6).set_stroke(GOLD, 3, 0.6)
        e3 = body("Chapter 1 · Introduction", 40, BODY)
        b1 = pill("Read the book", size=36)
        b2 = pill("perception.praisecu.com", size=34, outline=True)
        end = VGroup(e0, e1, e2, rule, e3, b1, b2).arrange(DOWN, buff=0.4).move_to(DOWN * 0.2)
        rule.shift(DOWN * 0.1); e3.shift(DOWN * 0.15); b1.shift(DOWN * 0.45); b2.shift(DOWN * 0.45)
        self.play(FadeIn(e0, shift=UP * 0.2), FadeIn(VGroup(e1, e2), shift=UP * 0.3), run_time=0.7)
        self.play(Create(rule), FadeIn(e3, shift=UP * 0.2), run_time=0.5)
        self.play(FadeIn(b1, shift=UP * 0.2), FadeIn(b2, shift=UP * 0.2), run_time=0.5)
        self.until(END)
