/**
 * `FiatMinor` is a branded number: domain code refuses a bare integer on
 * purpose, so a major-unit figure can never be passed where minor units belong.
 *
 * Fixtures still have to mint one, so they go through the real validating
 * constructor under a short name — never a cast, which would let a fixture
 * smuggle in a non-integer the domain would have rejected.
 */
export { fiatMinorFromInteger as fiatMinor } from "@/lib/domain/money";
