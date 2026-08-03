import { GenericSQL } from 'dt-sql-parser/dist/parser/generic'

import { installValidator } from './sql-workspace-validator-base'

installValidator(() => new GenericSQL())
