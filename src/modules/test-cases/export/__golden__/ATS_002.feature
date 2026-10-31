Feature: Login por rol
  @ATS_002
  Scenario Outline: Login por rol
    Given el usuario <user> existe
    When inicio sesión como <user>
    And abro <page>
    Then veo <result>

    Examples:
      | user | page | result |
      | ana | home | ok |
      | bob | admin | denegado |
      | ana | home | ok |
