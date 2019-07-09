#!/usr/bin/env node
const path = require('path')
const program = require('commander')
const PropertiesReader = require('properties-reader')
const request = require('request-promise-native')

program
    .version('0.1.0', '--version')
    .option('-r, --report <string>', 'Path to post-analysis sonar\'s report file')
    .parse(process.argv)

const reportPath = path.resolve(process.cwd(), program.report)
if (!reportPath) {
    throw new Error(`Não foi possível encontrar o caminho: ${reportPath}`)
}

const properties = PropertiesReader(reportPath)
const taskId = properties.get('ceTaskId')
const taskUrl = properties.get('ceTaskUrl')
const serverUrl = properties.get('serverUrl')

if (!taskId || !taskUrl) {
    throw new Error(`Não foi possível encontrar as chaves taskId ou taskUrl no arquivo: ${reportPath}`)
}

const failedStatus = ['FAILED', 'CANCELED']
const pendingStatus = ['PENDING', 'IN_PROGRESS']
const sucessStatus = ['SUCCESS']

const interval = setInterval(() => {
    console.info('Enviando requisição para identificar situação da análise')

    request({ uri: taskUrl, json: true })
        .then(result => {

            if (failedStatus.includes(result.task.status)) {
                clearInterval(interval)
                throw new Error(`A análise terminou com status ${result.task.status}`)

            } else if (pendingStatus.includes(result.task.status)) {
                console.info('Análise ainda está pendente no SonarQube')
                return { continue: true }

            } else if (sucessStatus.includes(result.task.status)) {
                console.info('Análise finalizada, buscando Quality Gate')

                const analysisId = result.task.analysisId
                if (!analysisId) {
                    throw new Error('Não foi possível recuperar o id da análise')
                }

                const qualityGateUrl = `${serverUrl}/api/qualitygates/project_status?analysisId=${analysisId}`

                return request({ uri: qualityGateUrl, json: true })

            } else {
                clearInterval(interval)
                throw new Error(`Não foi possível recuperar o resultado`)
            }

        })
        .then(response => {
            if (response.continue) {
                return;
            }

            if (!response || !response.projectStatus || !response.projectStatus.status) {
                clearInterval(interval)
                throw new Error('Não foi possível recuperar o status do projeto')
            }

            if (response.projectStatus.status !== "OK") {
                clearInterval(interval)
                throw new Error(`Quality Gate Status: ${response.projectStatus.status}`)
            }

            clearInterval(interval)
            console.info('Quality Gate passou com sucesso')

        })
        .catch(err => {
            console.error(err)
            process.exit(1)
        })

}, 1000)


