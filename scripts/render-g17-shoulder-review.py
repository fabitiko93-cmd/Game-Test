"""Compare the actual skinned shoulder before/after with matching cameras."""
import argparse
import importlib.util
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

spec = importlib.util.spec_from_file_location('hand_renderer', Path(__file__).with_name('render-g17-firing-hand.py'))
hand = importlib.util.module_from_spec(spec)
spec.loader.exec_module(hand)


def assemble(source, before, output):
    current = json.loads(Path(source).read_text())
    previous = json.loads(Path(before).read_text())
    sheet = Image.new('RGB', (2400, 3020), '#f4f7f9')
    draw = ImageDraw.Draw(sheet)
    font = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    title = ImageFont.truetype(font, 49)
    label = ImageFont.truetype(font, 29)
    small = ImageFont.truetype(font, 26)
    draw.rectangle((0, 0, 2400, 159), fill='#192630')
    draw.text((35, 27), 'G17 · SCHULTERKORREKTUR · VORSCHAU 07', font=title, fill='white')
    draw.text((37, 103), 'Schulter abgesenkt · Hautgewichte geglättet · Beide Griffe erhalten', font=small, fill='#bdcbd4')
    front = {'eye_direction': [-2, .5, 5], 'target_point': [-.015, 1.39, .18], 'extent': .64}
    back = {'eye_direction': [-4, .5, -3], 'target_point': [-.04, 1.38, .19], 'extent': .64}
    panels = [
        ('A · BISHER (06): SCHULTER VORN', previous, front),
        ('B · NEU (07): SCHULTER VORN', current, front),
        ('C · BISHER (06): SCHULTER HINTEN', previous, back),
        ('D · NEU (07): SCHULTER HINTEN', current, back),
        ('E · NEU (07): SEITENANSICHT', current, {'eye_direction': [-5, .3, .2], 'extent': .92}),
        ('F · ERHALTENER GRIFF', hand.firing_scene(current, 'RL'), {'eye_direction': [-4, 1, 3], 'target_point': [0, -.045, 0], 'extent': .32}),
    ]
    for i, (caption, scene, camera) in enumerate(panels):
        x = (i % 2) * 1200
        y = 180 + (i // 2) * 920
        draw.text((x + 22, y + 8), caption, font=label, fill='#233846')
        image = hand.renderer.render(scene, width=1200, height=850, **camera)
        sheet.paste(image, (x, y + 46))
    bend = current['contactMetrics']['alignedRight']['afterDegrees']
    angle = f'{bend:.1f}'.replace('.', ',')
    draw.text((35, 2950), f'Rechtes Handgelenk: {angle}° · Originalmodell und Originalfarben · Statische Vorschau zur Freigabe', font=small, fill='#405568')
    draw.text((35, 2987), 'Keine Änderung am veröffentlichten Spiel.', font=small, fill='#405568')
    output = Path(output)
    output.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(output)
    return output


if __name__ == '__main__':
    parser = argparse.ArgumentParser()
    parser.add_argument('source', type=Path)
    parser.add_argument('--before', required=True, type=Path)
    parser.add_argument('--output', required=True, type=Path)
    args = parser.parse_args()
    print(assemble(args.source, args.before, args.output))
