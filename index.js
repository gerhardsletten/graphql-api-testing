const fs = require('fs')
const path = require('path')
const { send } = require('micro')
const readFile = require('fs-readfile-promise')
const parseJSON = require('json-parse-async')
const { parse } = require('url')
const { microGraphql, microGraphiql } = require('graphql-server-micro')
const { makeExecutableSchema } = require('graphql-tools')
const cors = require('micro-cors')()

const root = './data/'
const filePath = process.env.DATA_FILE || path.resolve(root, 'data.json')
const filePathBW = process.env.DATA_FILE || path.resolve(root, 'data-bw.json')

const getdata = async () => {
  const data = await readFile(filePath)
  return await parseJSON(data)
}

const typeDefs = `
type Employee {
  id: ID!
  givenName: String
  familyName: String
  email: String
  mobilePhone: String
  workPhone: String
  positions: [Position]
}

type Position {
  id: ID!
  type: String
  info: String
  department: Department,
  employee: Employee
}

type Department {
  id: ID!
  name: String,
  positions: [Position]
}

type Query {
  departments(id: String): [Department],
  employees(phrase: String!): [Employee]
}

schema {
  query: Query
}
`

const schema = makeExecutableSchema({
  typeDefs,
  resolvers: {},
})

const handler = async (req, res) => {
  const data = await getdata()
  const departmentsList = data.results.reduce((list, {positions}) => {
    if (positions && !!positions.length) {
      const found = positions.reduce((newList, position) => {
        if (!list.find(({id}) => id === position.departmentId) && !newList.find(({id}) => id === position.departmentId) && position.departmentId) {
          return [...newList, {
            id: position.departmentId,
            name: position.departmentName || 'No name'
          }]
        }
        return newList
      }, [])
      return [...list, ...found]
    }
    return list
  }, [])
  const positionsList = data.results.reduce((list, {personId, positions}) => {
    if (positions && !!positions.length) {
      const found = positions.map((position) => {
        return {
          id: `${position.departmentId}-${personId}`,
          type: position.type,
          info: position.info,
          department: position.departmentId
        }
      })
      return [...list, ...found]
    }
    return list
  }, [])
  const employeeList = data.results.map(({personId, givenName, familyName, email, mobilePhone, workPhone, positions}) => {
    return {
      id: personId,
      givenName,
      familyName,
      email,
      mobilePhone,
      workPhone,
      positions: positions.map((position) => `${position.departmentId}-${personId}`)
    }
  })
  const schema = makeExecutableSchema({
    typeDefs,
    resolvers: {
      Query: {
        departments (_, {id}) {
          return id ? departmentsList.filter((dep) => dep.id === id) : departmentsList
        },
        employees (_, {phrase}) {
          return employeeList.filter(({id, givenName, familyName, email, mobilePhone, workPhone}) => {
            return `${id} ${givenName && givenName.toLowerCase()} ${familyName &&familyName.toLowerCase()} ${email && email.toLowerCase()} ${mobilePhone&& mobilePhone.toLowerCase()} ${workPhone && workPhone.toLowerCase()}`.includes(phrase.toLowerCase())
          })
        },
      },
      Department: {
        positions (department) {
          return positionsList.filter((position) => position.department === department.id)
        }
      },
      Position: {
        employee (position) {
          return employeeList.find(({positions}) => positions.includes(position.id))
        },
        department (position) {
          return departmentsList.find((dep) => dep.id === position.department)
        }
      },
      Employee: {
        positions (employee) {
          return positionsList.filter((position) => employee.positions.includes(position.id))
        }
      }
    }
  })
  const url = parse(req.url)
  if(url.pathname === '/graphiql') {
      return microGraphiql({endpointURL: '/'})(req, res)
  }
  return microGraphql({ schema })(req, res)

}
module.exports = cors(handler)
