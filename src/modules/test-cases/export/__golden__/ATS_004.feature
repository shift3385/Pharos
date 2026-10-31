Feature: Feature a mano

  Background:
    Given algo

  @ATS_004
  Scenario: Uno
    When hago
    Then pasa

  @ATS_004
  Scenario Outline: Dos
    When uso <x>
    Then <y>

    Examples:
      | x | y |
      | 1 | 2 |
