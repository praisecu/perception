"""Shared look for the book's vertical shorts (1080 x 1920).

Dark dot grid, handwritten labels (Ink Free), mono numbers (Cascadia Mono),
sketchy white outlines and CU gold accents. Covers use a soft gold glow with a
big question title.
"""
from pathlib import Path

import numpy as np
from manim import *

HERE = Path(__file__).parent
ASSETS = HERE / "assets"

config.pixel_width = 1080
config.pixel_height = 1920
config.frame_height = 16
config.frame_width = 9
config.frame_rate = 30
config.background_color = "#10110E"

# praisecu.com palette
GOLD = "#CFB97D"
GOLD_TEXT = "#D6BD72"
BTN_BG = "#343607"
BTN_LINE = "#A79047"
BTN_TEXT = "#F7DF91"
HEAD_BG = "#050600"
HEADING = "#F3EFE3"
BODY = "#D1D1CA"
GOLD_DARK = "#8a7440"
INK = "#F3EFE3"
MUTED = "#9a958a"
BLUE = "#7FB2F0"
RED = "#F0857F"
PANEL = "#17171a"

HAND = "Ink Free"
MONO = "Cascadia Mono"
SANS = "Nunito Sans Normal"
OPEN = "Open Sans"

import manimpango
for _f in (HERE / "fonts").glob("*.ttf"):
    manimpango.register_font(str(_f))

RNG = np.random.default_rng(7)


def hand(s, size=44, color=INK, **kw):
    return Text(s, font=HAND, font_size=size, color=color, **kw)


def mono(s, size=30, color=MUTED, **kw):
    return Text(s, font=MONO, font_size=size, color=color, **kw)


def title(s, size=96, color=INK, weight=ULTRABOLD):
    return Text(s, font=SANS, weight=weight, font_size=size, color=color)


def say(s, size=46, color=INK):
    """On-screen caption in the lab's heading font."""
    return Text(s, font=SANS, weight=BOLD, font_size=size, color=color)


def body(s, size=36, color=BODY):
    return Text(s, font=OPEN, font_size=size, color=color)


def kicker(s, size=28):
    """Small gold caps, like the dates on praisecu.com news cards."""
    return Text(s.upper(), font=SANS, weight=ULTRABOLD, font_size=size, color=GOLD_TEXT)


def _jitter(points, amp):
    """Smooth, pencil-like wobble: a continuous offset field, so curves never kink or break."""
    c = points.mean(0)
    th = np.arctan2(points[:, 1] - c[1], points[:, 0] - c[0])
    ph = RNG.uniform(0, 2 * np.pi, 4)
    dx = np.sin(2 * th + ph[0]) + 0.5 * np.sin(5 * th + ph[1])
    dy = np.sin(3 * th + ph[2]) + 0.5 * np.sin(4 * th + ph[3])
    off = np.stack([dx, dy, np.zeros_like(dx)], 1) * amp * 0.9
    return points + off


def rough_box(w, h, color=INK, stroke=4, radius=0.18, amp=0.018, fill=None, fill_opacity=0.0):
    """Two slightly offset hand-drawn passes of a rounded rectangle."""
    g = VGroup()
    for k in range(2):
        r = RoundedRectangle(width=w, height=h, corner_radius=radius)
        pts = _jitter(r.points.copy(), amp)
        pts[-1] = pts[0]  # keep the outline closed so fills work
        r.set_points(pts)
        r.set_stroke(color, stroke if k == 0 else stroke * 0.55, opacity=1 if k == 0 else 0.55)
        if k == 0 and fill:
            r.set_fill(fill, fill_opacity)
        g.add(r)
    return g


def rough_line(a, b, color=INK, stroke=4, bend=0.06):
    a, b = np.array(a, float), np.array(b, float)
    mid = (a + b) / 2 + np.array([-(b - a)[1], (b - a)[0], 0]) * bend
    return VMobject().set_points_smoothly([a, mid, b]).set_stroke(color, stroke)


def rough_arrow(a, b, color=INK, stroke=4):
    a, b = np.array(a, float), np.array(b, float)
    line = rough_line(a, b, color, stroke, bend=0.04)
    d = (b - a) / np.linalg.norm(b - a)
    n = np.array([-d[1], d[0], 0])
    head = VMobject().set_points_as_corners([b - 0.22 * d + 0.14 * n, b, b - 0.22 * d - 0.14 * n])
    head.set_stroke(color, stroke)
    return VGroup(line, head)


def underline(mob, color=GOLD, stroke=6, pad=0.05):
    left = mob.get_corner(DL) + DOWN * 0.12 + LEFT * pad
    right = mob.get_corner(DR) + DOWN * 0.12 + RIGHT * pad
    mid = (left + right) / 2 + DOWN * 0.07
    return VMobject().set_points_smoothly([left, mid + LEFT * 0.4, mid + RIGHT * 0.4, right]).set_stroke(color, stroke)


def pill(s, color=None, text_color=None, size=34, font=None, outline=False):
    """A praisecu.com button: olive fill, gold edge, pale gold text."""
    t = Text(s, font=SANS, weight=BOLD, font_size=size, color=BTN_TEXT if not outline else GOLD_TEXT)
    h = t.height + 0.42
    bg = RoundedRectangle(width=t.width + 0.7, height=h, corner_radius=0.16)
    if outline:
        bg.set_fill(HEAD_BG, 0).set_stroke(BTN_LINE, 3)
    else:
        bg.set_fill(BTN_BG, 1).set_stroke(BTN_LINE, 3)
    t.move_to(bg)
    return VGroup(bg, t)


def header_bar():
    """Small CU logo and gold PRAISe Lab in the top right corner."""
    return brand_row(26).to_corner(UR, buff=0.35)


def rounded_image(path, width, r=0.3):
    """ImageMobject of `width` units with corners rounded to r units (cached PNG next to the source)."""
    from PIL import Image as _Im, ImageDraw as _Dr
    path = Path(path)
    out = path.with_name(f"{path.stem}_r{int(round(r * 100))}w{int(round(width * 100))}.png")
    if not out.exists():
        im = _Im.open(path).convert("RGBA")
        rp = int(round(r / width * im.width))
        m = _Im.new("L", im.size, 0)
        _Dr.Draw(m).rounded_rectangle([0, 0, im.width - 1, im.height - 1], radius=rp, fill=255)
        im.putalpha(m)
        im.save(out)
    return ImageMobject(str(out)).set_width(width)


def card(w, h, r=0.28):
    """A news-card style panel with a soft border."""
    return RoundedRectangle(width=w, height=h, corner_radius=r).set_fill("#16170f", 1).set_stroke("#3a3b33", 2)


def grid_bg():
    return ImageMobject(str(ASSETS / "grid_bg.png")).set_height(config.frame_height)


def cover_bg():
    return ImageMobject(str(ASSETS / "cover_bg.png")).set_height(config.frame_height)


def brand_row(size=30):
    logo = ImageMobject(str(ASSETS / "cu-logo.png")).set_height(0.55)
    lab = Text("PRAISe Lab", font=SANS, weight=BOLD, font_size=size, color=GOLD)
    logo.set_height(lab.height * 1.45)
    lab.next_to(logo, RIGHT, buff=0.18)
    return Group(logo, lab)


def drone_doodle(scale=1.0, color=INK):
    """Top view of a quadrotor: X frame, four rotors, a body."""
    arms = VGroup(
        rough_line([-0.55, -0.55, 0], [0.55, 0.55, 0], color, 5, 0.0),
        rough_line([-0.55, 0.55, 0], [0.55, -0.55, 0], color, 5, 0.0),
    )
    rotors = VGroup(*[Circle(radius=0.28).set_stroke(color, 4).move_to([x, y, 0])
                      for x in (-0.6, 0.6) for y in (-0.6, 0.6)])
    body = RoundedRectangle(width=0.42, height=0.42, corner_radius=0.1).set_fill(GOLD, 1).set_stroke(color, 3)
    return VGroup(arms, rotors, body).scale(scale)


def camera_doodle(scale=1.0, color=INK):
    body = rough_box(1.9, 1.15, color, 5, radius=0.2)
    lens = VGroup(Circle(radius=0.36).set_stroke(color, 5), Circle(radius=0.16).set_stroke(GOLD, 5))
    bump = rough_box(0.55, 0.24, color, 4, radius=0.06).next_to(body, UP, buff=-0.02).shift(LEFT * 0.45)
    dot = Dot(radius=0.06, color=RED).move_to(body.get_corner(UR) + DL * 0.22)
    return VGroup(body, lens, bump, dot).scale(scale)


# ---------- Shared bookends ----------

def play_cover(scene, chapter, line1, line2, sub, image=None, hold=1.4, extra=None):
    """Lab-style cover: gold kicker, two-line question title, subtitle, optional image card.

    Adds the grid background and the persistent header bar. Returns the background.
    """
    bg = grid_bg()
    head_bar = header_bar()
    k = kicker(chapter, 30)
    t1 = title(line1, 100, HEADING)
    t2 = title(line2, 120, GOLD)
    for t in (t1, t2):
        if t.width > 8.2:
            t.scale_to_fit_width(8.2)
    s = body(sub, 40)
    items = [k, t1, t2, s]
    if image is not None:
        im = rounded_image(image, 7.4, 0.3)
        c = card(7.8, im.height + 0.4, 0.3 + 0.2)
        im.move_to(c)
        items.append(Group(c, im))
    elif extra is not None:
        items.append(extra)
    block = Group(*items).arrange(DOWN, buff=0.5).move_to(DOWN * 0.3)
    scene.add(bg)
    scene.add_foreground_mobject(head_bar)
    scene.play(FadeIn(k, shift=UP * 0.2), FadeIn(t1, shift=UP * 0.3), FadeIn(t2, shift=UP * 0.3), run_time=0.7)
    rest = [FadeIn(s, shift=UP * 0.2)]
    if image is not None or extra is not None:
        rest.append(FadeIn(items[-1], scale=0.96))
    scene.play(*rest, run_time=0.7)
    scene.wait(hold)
    scene.play(FadeOut(block, shift=UP * 0.3), run_time=0.5)
    return bg


def play_end_card(scene, chapter_label, hold=1.8):
    e0 = kicker("An open online book", 30)
    e1 = title("Fundamentals of", 84, HEADING)
    e2 = title("Robot Perception", 96, GOLD)
    for t in (e1, e2):
        if t.width > 8.2:
            t.scale_to_fit_width(8.2)
    rule = Line(LEFT * 1.6, RIGHT * 1.6).set_stroke(GOLD, 3, 0.6)
    e3 = body(chapter_label, 40, BODY)
    b1 = body("Read more at", 36, BODY)
    b2 = pill("perception.praisecu.com", size=36)
    VGroup(e0, e1, e2, rule, e3, b1, b2).arrange(DOWN, buff=0.4).move_to(DOWN * 0.2)
    rule.shift(DOWN * 0.1); e3.shift(DOWN * 0.15); b1.shift(DOWN * 0.5); b2.shift(DOWN * 0.45)
    scene.play(FadeIn(e0, shift=UP * 0.2), FadeIn(VGroup(e1, e2), shift=UP * 0.3), run_time=0.7)
    scene.play(Create(rule), FadeIn(e3, shift=UP * 0.2), run_time=0.5)
    scene.play(FadeIn(b1, shift=UP * 0.2), FadeIn(b2, shift=UP * 0.2), run_time=0.5)
    scene.wait(hold)


def fit(mob, w=8.0):
    if mob.width > w:
        mob.scale_to_fit_width(w)
    return mob


def bee_doodle(scale=1.0, color=INK):
    """Side view of a bee: striped body, head, two wings, antennae."""
    body_ = Ellipse(width=1.5, height=0.85).set_fill(GOLD, 1).set_stroke(color, 4)
    stripes = VGroup(*[Line(UP * 0.4, DOWN * 0.4).set_stroke("#141414", 9).move_to(body_.get_center() + RIGHT * dx)
                       for dx in (-0.2, 0.15)])
    stripes[0].scale(0.98); stripes[1].scale(0.9)
    head = Circle(radius=0.28).set_fill("#1b1b18", 1).set_stroke(color, 4).next_to(body_, RIGHT, buff=-0.12)
    eye = Dot(radius=0.06, color=INK).move_to(head.get_center() + RIGHT * 0.08 + UP * 0.05)
    w1 = Ellipse(width=0.9, height=0.5).set_fill(INK, 0.18).set_stroke(color, 3).rotate(0.5).move_to(body_.get_top() + UP * 0.28 + LEFT * 0.15)
    w2 = Ellipse(width=0.75, height=0.42).set_fill(INK, 0.12).set_stroke(color, 3).rotate(0.9).move_to(body_.get_top() + UP * 0.22 + RIGHT * 0.15)
    ant = VMobject().set_points_smoothly([head.get_top(), head.get_top() + UP * 0.25 + RIGHT * 0.1, head.get_top() + UP * 0.3 + RIGHT * 0.3]).set_stroke(color, 3)
    sting = Triangle().scale(0.08).rotate(PI / 2).set_fill(color, 1).set_stroke(width=0).next_to(body_, LEFT, buff=-0.02)
    return VGroup(w1, w2, body_, stripes, head, eye, ant, sting).scale(scale)


def fast_counter(tracker, size=100, color=None, anchor=None):
    """A counting number that copies pre-built digit glyphs each frame.

    Building a new Text every frame is very slow; copying ten cached glyphs is not.
    """
    color = color or GOLD
    glyphs = {ch: title(ch, size, color) for ch in "0123456789,"}
    adv = max(glyphs[d].width for d in "0123456789") * 1.04
    comma_adv = glyphs[","].width * 1.6
    base_h = glyphs["0"].height

    def build():
        s = f"{int(tracker.get_value()):,}"
        g = VGroup()
        x = 0.0
        for ch in s:
            m = glyphs[ch].copy()
            w = comma_adv if ch == "," else adv
            if ch == ",":
                m.move_to([x + w / 2, -base_h / 2 + m.height / 2 - 0.12, 0])
            else:
                m.move_to([x + w / 2, 0, 0])
            g.add(m)
            x += w
        if anchor is not None:
            g.move_to(anchor)
        return g

    return always_redraw(build)
