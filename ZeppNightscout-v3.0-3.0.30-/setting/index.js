/**
 * ZightScout - Configuracoes do aplicativo
 * Pagina de configuracoes exibida no app Zepp (celular)
 */

AppSettingsPage({
  build(props) {
    return Section(
      {},
      [
        Text({
          label: 'ZightScout - Monitor de Glicose'
        }),
        Section(
          {
            title: 'Configuracao no relogio'
          },
          [
            Text({
              label: 'Use Ajustes ZightScout no relogio para thresholds, alertas e segundo plano.'
            })
          ]
        )
      ]
    );
  }
});