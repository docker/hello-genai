/**
 * Hecto.java
 *
 * A small, self-contained model of a "hecto-inch" measurement.
 *
 * The metric-style prefix "hecto-" means x100, so a {@code Hecto} value of
 * {@code n} represents {@code n * 100} inches. This record provides simple,
 * lossless conversions to inches, feet, centimeters and meters.
 */
public record Hecto(double value) {

    /** Number of inches in a single hecto-inch. */
    public static final double INCHES_PER_HECTO = 100.0;

    /**
     * Compact constructor. Rejects non-finite values (NaN and infinities).
     * Negative values are permitted, as they are valid signed measurements.
     */
    public Hecto {
        if (Double.isNaN(value)) {
            throw new IllegalArgumentException("value must not be NaN");
        }
        if (Double.isInfinite(value)) {
            throw new IllegalArgumentException("value must be finite, was: " + value);
        }
    }

    /** @return this measurement expressed in inches. */
    public double inches() {
        return value * INCHES_PER_HECTO;
    }

    /** @return this measurement expressed in feet (12 inches per foot). */
    public double feet() {
        return inches() / 12.0;
    }

    /** @return this measurement expressed in centimeters (2.54 cm per inch). */
    public double centimeters() {
        return inches() * 2.54;
    }

    /** @return this measurement expressed in meters (100 cm per meter). */
    public double meters() {
        return centimeters() / 100.0;
    }

    /**
     * Factory building a {@code Hecto} from a raw inch count.
     *
     * @param inches the number of inches
     * @return a {@code Hecto} representing the same length
     */
    public static Hecto ofInches(double inches) {
        return new Hecto(inches / INCHES_PER_HECTO);
    }

    @Override
    public String toString() {
        return String.format(
            "%s hecto-inch (%s in = %s ft = %s m)",
            round(value), round(inches()), round(feet()), round(meters()));
    }

    /** Round to three decimal places for readable output. */
    private static double round(double d) {
        return Math.round(d * 1000.0) / 1000.0;
    }

    public static void main(String[] args) {
        Hecto oneHecto = new Hecto(1);
        System.out.println(oneHecto);
        System.out.printf("value      = %s hecto-inch%n", round(oneHecto.value()));
        System.out.printf("inches     = %s in%n", round(oneHecto.inches()));
        System.out.printf("feet       = %s ft%n", round(oneHecto.feet()));
        System.out.printf("centimeters= %s cm%n", round(oneHecto.centimeters()));
        System.out.printf("meters     = %s m%n", round(oneHecto.meters()));

        // 100 inches = 8 ft 4 in, i.e. 8 full feet plus a 4-inch remainder.
        int wholeFeet = (int) (oneHecto.inches() / 12.0);
        double remainderInches = oneHecto.inches() - wholeFeet * 12.0;
        System.out.printf(
            "check      = %d ft %s in = %s cm = %s m%n",
            wholeFeet, round(remainderInches),
            round(oneHecto.centimeters()), round(oneHecto.meters()));
    }
}
