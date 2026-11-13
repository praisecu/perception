"""Chapter 1 short 3: "How do bees fly so well?"

Story: a bee has about a million neurons, yet it flies through clutter and
lands gently. It uses two cheap tricks based on image motion: balance the
flow on both sides, and hold the ground's image speed constant while landing.
Robots can borrow the same tricks.

Render: manim -qh --format mp4 ch01_nature.py Nature
"""
import numpy as np

from short_style import *


class Nature(Scene):
    def construct(self):
        play_cover(self, "Chapter 1 · Introduction", "How do bees", "fly so well?",
                   "Nature solved perception first.", extra=bee_doodle(2.4))

        # ---------- Beat A: a tiny brain (3 to 10 s) ----------
        bee = bee_doodle(1.6).move_to(UP * 4.3)
        l1 = body("A honeybee's brain", 40)
        n1 = title("≈ 1,000,000", 110, GOLD)
        n1l = body("neurons", 40)
        fit(n1, 7.6)
        g1 = VGroup(l1, n1, n1l).arrange(DOWN, buff=0.25).move_to(UP * 1.0)
        self.play(FadeIn(bee, shift=UP * 0.3), FadeIn(l1), run_time=0.7)
        self.play(FadeIn(n1, scale=0.8), FadeIn(n1l), run_time=0.7)
        l2 = body("Yours", 36, MUTED)
        n2 = title("≈ 86,000,000,000", 64, INK)
        g2 = VGroup(l2, n2).arrange(DOWN, buff=0.2).next_to(g1, DOWN, buff=0.8)
        self.play(FadeIn(g2, shift=UP * 0.2), run_time=0.6)
        yet = say("Yet it flies through clutter", 46)
        yet2 = say("and lands on a flower.", 46, GOLD)
        gy = VGroup(yet, yet2).arrange(DOWN, buff=0.25).next_to(g2, DOWN, buff=0.9)
        fit(yet, 8.2)
        self.play(Write(yet), run_time=0.8)
        self.play(Write(yet2), run_time=0.7)
        self.wait(1.2)

        # ---------- Beat B: balance the flow (10 to 21 s) ----------
        self.play(FadeOut(VGroup(bee, g1, g2, gy)), run_time=0.5)
        cap = say("Trick 1: balance the motion.", 50).move_to(UP * 5.3)
        fit(cap, 8.4)
        wl, wr = -3.0, 3.0
        y_lo, y_hi = -5.6, 3.9
        walls = VGroup()
        for x in (wl, wr):
            walls.add(Line([x, y_lo, 0], [x, y_hi, 0]).set_stroke(INK, 6))
        stripes = VGroup()
        for x, sgn in ((wl, -1), (wr, 1)):
            for y in np.arange(y_lo, y_hi, 0.6):
                stripes.add(Line([x, y, 0], [x + sgn * 0.45, y + 0.3, 0]).set_stroke(MUTED, 3, 0.7))
        self.play(Write(cap), Create(walls), FadeIn(stripes), run_time=0.9)

        bx = ValueTracker(-1.9)
        by = -1.0

        def top_bee():
            b = VGroup(
                Ellipse(width=0.42, height=0.8).set_fill(GOLD, 1).set_stroke(INK, 3),
                Ellipse(width=0.55, height=0.32).set_fill(INK, 0.25).set_stroke(INK, 2).shift(LEFT * 0.33 + UP * 0.08),
                Ellipse(width=0.55, height=0.32).set_fill(INK, 0.25).set_stroke(INK, 2).shift(RIGHT * 0.33 + UP * 0.08),
                Circle(radius=0.16).set_fill("#1b1b18", 1).set_stroke(INK, 3).shift(UP * 0.5),
            )
            return b.move_to([bx.get_value(), by, 0])

        def flows():
            x = bx.get_value()
            dl, dr = x - wl, wr - x
            g = VGroup()
            for side, d in ((-1, dl), (1, dr)):
                L = min(2.0, 1.6 / d)
                xs = x + side * (d * 0.5)
                for yy in (by + 1.2, by, by - 1.2):
                    a = Arrow([xs, yy + L / 2, 0], [xs, yy - L / 2, 0], buff=0, stroke_width=6,
                              max_tip_length_to_length_ratio=0.3, color=GOLD if L > 1.0 else INK)
                    g.add(a)
            return g

        b = always_redraw(top_bee)
        fl = always_redraw(flows)
        self.play(FadeIn(b), FadeIn(fl), run_time=0.5)
        t1 = body("Left wall is close: it streams past fast.", 34)
        fit(t1, 8.2).move_to(DOWN * 6.4)
        self.play(FadeIn(t1, shift=UP * 0.2), run_time=0.5)
        self.wait(1.0)
        t2 = body("Steer until both sides match.", 36, INK)
        fit(t2, 8.2).move_to(t1)
        self.play(FadeOut(t1), FadeIn(t2), run_time=0.4)
        self.play(bx.animate.set_value(0), run_time=2.2, rate_func=rate_functions.ease_in_out_sine)
        eq = pill("centred", size=34).move_to(UP * 3.2)
        cred = mono("Srinivasan et al., 1991", 22, MUTED).move_to(DOWN * 7.2)
        self.play(FadeIn(eq, scale=0.8), FadeIn(cred), run_time=0.5)
        self.wait(1.2)
        b.clear_updaters(); fl.clear_updaters()

        # ---------- Beat C: land by holding flow constant (21 to 29 s) ----------
        self.play(FadeOut(Group(cap, walls, stripes, b, fl, t2, eq, cred)), run_time=0.5)
        cap2 = say("Trick 2: land by keeping", 50).move_to(UP * 5.4)
        cap2b = say("the ground's motion steady.", 50, GOLD).next_to(cap2, DOWN, buff=0.25)
        fit(cap2, 8.4); fit(cap2b, 8.4)
        ground = Line([-4.2, -4.5, 0], [4.2, -4.5, 0]).set_stroke(INK, 6)
        grass = VGroup(*[Line([x, -4.5, 0], [x + 0.18, -4.85, 0]).set_stroke(MUTED, 3) for x in np.arange(-4.1, 4.1, 0.4)])
        flower = VGroup(Line([3.3, -4.5, 0], [3.3, -3.7, 0]).set_stroke("#6aa86a", 5),
                        *[Circle(radius=0.17).set_fill(RED, 1).set_stroke(width=0).move_to([3.3 + 0.2 * np.cos(a), -3.6 + 0.2 * np.sin(a), 0])
                          for a in np.linspace(0, 2 * PI, 6, endpoint=False)],
                        Dot([3.3, -3.6, 0], radius=0.12, color=GOLD))
        self.play(Write(cap2), Write(cap2b), Create(ground), FadeIn(grass), FadeIn(flower), run_time=1.0)

        # Height h and speed v with v = c h: height decays exponentially, so the
        # bee slows down smoothly and touches down gently.
        p = ValueTracker(0.0)
        x0, h0, x_end = -3.8, 6.6, 2.3
        def state(tt):
            h = h0 * np.exp(-3.2 * tt) + 0.15
            x = x0 + (x_end - x0) * (1 - np.exp(-3.2 * tt)) / (1 - np.exp(-3.2))
            return x, h
        sb = always_redraw(lambda: bee_doodle(0.75).move_to([state(p.get_value())[0], -4.5 + 0.45 + state(p.get_value())[1] * 0.75, 0]))
        trail = TracedPath(lambda: sb.get_center(), stroke_color=GOLD, stroke_width=3, dissipating_time=None)
        spd = always_redraw(lambda: body(f"speed  {state(p.get_value())[1] / h0 * 100:4.0f}%", 34, INK).move_to(DOWN * 6.2))
        self.add(trail)
        self.play(FadeIn(sb), FadeIn(spd), run_time=0.4)
        self.play(p.animate.set_value(1.0), run_time=3.6, rate_func=linear)
        note = body("Speed falls with height: a soft touchdown.", 32, GOLD).move_to(DOWN * 6.9)
        fit(note, 8.4)
        self.play(FadeIn(note, shift=UP * 0.2), run_time=0.5)
        self.wait(1.0)
        sb.clear_updaters(); spd.clear_updaters()

        # ---------- Beat D: robots borrow the tricks (29 to 35 s) ----------
        self.play(FadeOut(Group(cap2, cap2b, ground, grass, flower, sb, trail, spd, note)), run_time=0.5)
        cap3 = say("Robots can borrow the same tricks.", 48)
        fit(cap3, 8.4).move_to(UP * 5.3)
        im = ImageMobject(str(ASSETS / "lab-drone.jpg")).set_width(7.0)
        c = card(7.6, im.height + 0.5).set_fill("#f4f3ef", 1)
        im.move_to(c)
        grp = Group(c, im).move_to(UP * 1.4)
        mp = pill("Minimal Perception", size=40).next_to(grp, DOWN, buff=0.6)
        sub = body("Small, fast, efficient robots", 38).next_to(mp, DOWN, buff=0.4)
        cred = mono("PRAISe Lab drone", 24, MUTED).next_to(grp, UP, buff=0.15).align_to(grp, RIGHT)
        self.play(Write(cap3), FadeIn(grp, scale=0.95), FadeIn(cred), run_time=0.9)
        self.play(FadeIn(mp, shift=UP * 0.2), FadeIn(sub, shift=UP * 0.2), run_time=0.6)
        self.wait(1.6)

        # ---------- Close (35 to 39 s) ----------
        self.play(FadeOut(Group(cap3, grp, mp, sub, cred)), run_time=0.5)
        c1 = say("Perception doesn't need", 56)
        c2 = title("a big brain.", 104, GOLD)
        c3 = body("It needs the right clues.", 42, INK)
        VGroup(c1, c2, c3).arrange(DOWN, buff=0.45).move_to(UP * 1.2)
        fit(c1, 8.2)
        self.play(Write(c1), run_time=0.7)
        self.play(FadeIn(c2, shift=UP * 0.3), run_time=0.6)
        self.play(FadeIn(c3, shift=UP * 0.2), run_time=0.6)
        self.wait(1.4)
        self.play(FadeOut(VGroup(c1, c2, c3)), run_time=0.5)
        play_end_card(self, "Chapter 1 · Introduction")
