/**
 * Husband.java
 *
 * A lighthearted, self-contained Java program that models a "Husband" as a
 * small object with state (name, age, mood, energy) and behaviors that mutate
 * that state and narrate what happens.
 *
 * It has no external dependencies, so it can be compiled and run with:
 *     javac Husband.java
 *     java Husband
 *
 * The {@code main} method walks through a short "day in the life" sequence to
 * produce readable output. This is a fun demo, not a serious domain model.
 */
public class Husband {

    /** The possible moods a husband can be in at any given moment. */
    public enum Mood {
        HAPPY,
        HUNGRY,
        TIRED,
        ROMANTIC,
        GRUMPY
    }

    // --- Fields -----------------------------------------------------------

    private final String name;
    private final int age;
    private Mood mood;
    private int energy;            // clamped to the range [0, 100]
    private final String marriedTo; // spouse's name

    // --- Construction -----------------------------------------------------

    /**
     * Creates a new Husband.
     *
     * @param name      the husband's name
     * @param age       the husband's age
     * @param marriedTo the spouse's name
     */
    public Husband(String name, int age, String marriedTo) {
        this.name = name;
        this.age = age;
        this.marriedTo = marriedTo;
        this.mood = Mood.HAPPY; // starts the day optimistic
        this.energy = 80;       // reasonably rested to begin with
    }

    // --- Getters ----------------------------------------------------------

    public String getName() {
        return name;
    }

    public int getAge() {
        return age;
    }

    public Mood getMood() {
        return mood;
    }

    public int getEnergy() {
        return energy;
    }

    public String getMarriedTo() {
        return marriedTo;
    }

    // --- Helpers ----------------------------------------------------------

    /**
     * Adjusts energy by {@code delta} while guarding the valid range so that
     * energy never drops below 0 or climbs above 100.
     *
     * @param delta the amount to add (may be negative)
     */
    private void changeEnergy(int delta) {
        energy += delta;
        if (energy < 0) {
            energy = 0;
        } else if (energy > 100) {
            energy = 100;
        }
    }

    // --- Behaviors --------------------------------------------------------

    /**
     * Does the chores: costs energy but earns some marital goodwill.
     */
    public void doChores() {
        changeEnergy(-25);
        System.out.println(name + " does the chores. " + marriedTo
                + " is impressed! (energy now " + energy + ")");
        // Hard work tends to leave him a little worn out.
        if (energy < 30) {
            mood = Mood.TIRED;
        }
    }

    /**
     * Watches some TV to unwind. Restores a little energy, but being
     * interrupted mid-show turns the mood GRUMPY.
     *
     * @param interrupted whether someone interrupted the show
     */
    public void watchTV(boolean interrupted) {
        changeEnergy(10);
        if (interrupted) {
            mood = Mood.GRUMPY;
            System.out.println(name + " was watching TV but got interrupted "
                    + "at the best part. Now GRUMPY. (energy " + energy + ")");
        } else {
            System.out.println(name + " relaxes in front of the TV. "
                    + "(energy " + energy + ")");
        }
    }

    /**
     * Cooks a dish. This is satisfying work, so it sets a HAPPY mood, but it
     * costs some energy.
     *
     * @param dish the name of the dish being cooked
     */
    public void cook(String dish) {
        changeEnergy(-15);
        mood = Mood.HAPPY;
        System.out.println(name + " cooks " + dish + " for " + marriedTo
                + ". Smells great! (energy " + energy + ")");
    }

    /**
     * Gives a heartfelt compliment. A sweet, low-cost romantic gesture.
     */
    public void giveCompliment() {
        mood = Mood.ROMANTIC;
        changeEnergy(-2);
        System.out.println(name + " tells " + marriedTo
                + ", \"You look wonderful today.\" (mood ROMANTIC)");
    }

    /**
     * Brings home flowers. A classic romantic gesture that lifts the mood.
     */
    public void bringFlowers() {
        mood = Mood.ROMANTIC;
        changeEnergy(-5);
        System.out.println(name + " surprises " + marriedTo
                + " with a bouquet of flowers. Awww! (mood ROMANTIC)");
    }

    /**
     * Eats a meal. If HUNGRY, this is especially satisfying and restores more
     * energy while lifting the mood to HAPPY.
     */
    public void eat() {
        if (mood == Mood.HUNGRY) {
            changeEnergy(30);
            mood = Mood.HAPPY;
            System.out.println(name + " was starving and finally eats. "
                    + "Much better! (energy " + energy + ", mood HAPPY)");
        } else {
            changeEnergy(15);
            System.out.println(name + " has a snack. (energy " + energy + ")");
        }
    }

    /**
     * Sleeps through the night: fully restores energy and resets the mood.
     */
    public void sleep() {
        energy = 100;      // a good night's sleep is a full recharge
        mood = Mood.HAPPY;
        System.out.println(name + " sleeps soundly and wakes up refreshed. "
                + "(energy 100, mood HAPPY)");
    }

    /**
     * Makes the husband hungry — useful for demonstrating {@link #eat()}.
     */
    public void getHungry() {
        mood = Mood.HUNGRY;
        System.out.println(name + "'s stomach growls... he's HUNGRY.");
    }

    /**
     * Prints a friendly description of the husband's current state.
     */
    public void describe() {
        System.out.println(this.toString());
    }

    @Override
    public String toString() {
        return String.format(
                "Husband{name='%s', age=%d, marriedTo='%s', mood=%s, energy=%d}",
                name, age, marriedTo, mood, energy);
    }

    // --- Entry point ------------------------------------------------------

    /**
     * Runs a short "day in the life" scenario so the program prints readable
     * output when executed.
     *
     * @param args command-line arguments (unused)
     */
    public static void main(String[] args) {
        Husband husband = new Husband("Dave", 34, "Sam");

        System.out.println("=== A Day in the Life of a Husband ===");
        husband.describe();
        System.out.println();

        // Morning: a productive start.
        husband.cook("pancakes");
        husband.doChores();

        // Midday: gets peckish, then eats.
        husband.getHungry();
        husband.eat();

        // Afternoon: some romance and a little downtime.
        husband.bringFlowers();
        husband.giveCompliment();
        husband.watchTV(true); // interrupted at the best part

        System.out.println();
        System.out.println("Before bed:");
        husband.describe();

        // Night: recharge for tomorrow.
        System.out.println();
        husband.sleep();
        husband.describe();
    }
}
