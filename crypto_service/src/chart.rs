use crate::models::CandlePoint;
use font8x8::{UnicodeFonts, BASIC_FONTS};
use image::{codecs::png::PngEncoder, ExtendedColorType, ImageEncoder};
use plotters::{coord::Shift, prelude::*};

const WIDTH: u32 = 800;
const HEIGHT: u32 = 400;

fn draw_label(
    area: &DrawingArea<BitMapBackend<'_>, Shift>,
    x: i32,
    y: i32,
    label: &str,
    color: RGBColor,
) -> Result<(), String> {
    for (index, ch) in label.chars().enumerate() {
        if let Some(glyph) = BASIC_FONTS.get(ch) {
            for (row, bits) in glyph.iter().enumerate() {
                for col in 0..8 {
                    if bits & (1 << col) != 0 {
                        area.draw_pixel((x + index as i32 * 8 + col, y + row as i32), &color)
                            .map_err(|err| err.to_string())?;
                    }
                }
            }
        }
    }
    Ok(())
}

pub fn generate_price_chart_png(
    symbol: &str,
    points: &[CandlePoint],
    simulated: bool,
) -> Result<Vec<u8>, String> {
    if points.len() < 2 || points.iter().any(|point| !point.value.is_finite()) {
        return Err("Série de preços inválida".into());
    }

    let mut pixels = vec![0u8; (WIDTH * HEIGHT * 3) as usize];
    {
        let area = BitMapBackend::with_buffer(&mut pixels, (WIDTH, HEIGHT)).into_drawing_area();
        area.fill(&RGBColor(12, 20, 30))
            .map_err(|err| err.to_string())?;

        let left = 85;
        let right = WIDTH as i32 - 30;
        let top = 50;
        let bottom = HEIGHT as i32 - 48;
        let minimum = points
            .iter()
            .map(|point| point.value)
            .fold(f64::INFINITY, f64::min);
        let maximum = points
            .iter()
            .map(|point| point.value)
            .fold(f64::NEG_INFINITY, f64::max);
        let padding = ((maximum - minimum) * 0.12)
            .max(maximum.abs() * 0.001)
            .max(0.01);
        let low = minimum - padding;
        let high = maximum + padding;

        for i in 0..=4 {
            let y = top + (bottom - top) * i / 4;
            area.draw(&PathElement::new(
                vec![(left, y), (right, y)],
                RGBColor(46, 63, 79),
            ))
            .map_err(|err| err.to_string())?;
            draw_label(
                &area,
                8,
                y - 4,
                &format!("{:.2}", high - (high - low) * i as f64 / 4.0),
                RGBColor(161, 180, 195),
            )?;
        }
        for i in 0..=4 {
            let x = left + (right - left) * i / 4;
            area.draw(&PathElement::new(
                vec![(x, top), (x, bottom)],
                RGBColor(36, 53, 69),
            ))
            .map_err(|err| err.to_string())?;
            draw_label(
                &area,
                x - 10,
                bottom + 12,
                &format!("{}H", (points.len() - 1) * i as usize / 4),
                RGBColor(161, 180, 195),
            )?;
        }
        area.draw(&PathElement::new(
            vec![(left, top), (left, bottom), (right, bottom)],
            RGBColor(180, 196, 210),
        ))
        .map_err(|err| err.to_string())?;

        let line: Vec<(i32, i32)> = points
            .iter()
            .enumerate()
            .map(|(index, point)| {
                let x = left + (right - left) * index as i32 / (points.len() as i32 - 1);
                let y = bottom
                    - ((point.value - low) / (high - low) * (bottom - top) as f64).round() as i32;
                (x, y)
            })
            .collect();
        area.draw(&PathElement::new(
            line,
            RGBColor(83, 214, 178).stroke_width(3),
        ))
        .map_err(|err| err.to_string())?;
        draw_label(
            &area,
            85,
            18,
            &format!("CRYPTO PRICE HISTORY - {symbol}"),
            RGBColor(235, 242, 247),
        )?;
        draw_label(
            &area,
            560,
            18,
            if simulated {
                "SIMULATED DATA"
            } else {
                "ESTIMATED SERIES"
            },
            RGBColor(239, 184, 103),
        )?;
        draw_label(&area, 330, 380, "HOURS", RGBColor(161, 180, 195))?;
        area.present().map_err(|err| err.to_string())?;
    }

    let mut png = Vec::new();
    PngEncoder::new(&mut png)
        .write_image(&pixels, WIDTH, HEIGHT, ExtendedColorType::Rgb8)
        .map_err(|err| err.to_string())?;
    Ok(png)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn produces_png_in_memory() {
        let points = [
            CandlePoint {
                time: 0,
                value: 100.0,
            },
            CandlePoint {
                time: 3600,
                value: 105.0,
            },
        ];
        let png = generate_price_chart_png("BTCUSDT", &points, true).unwrap();
        assert_eq!(&png[..8], b"\x89PNG\r\n\x1a\n");
    }
}
