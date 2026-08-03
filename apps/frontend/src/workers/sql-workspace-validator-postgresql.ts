import { PostgreSQL } from 'dt-sql-parser/dist/parser/postgresql'

import { installValidator } from './sql-workspace-validator-base'

installValidator(() => new PostgreSQL())
