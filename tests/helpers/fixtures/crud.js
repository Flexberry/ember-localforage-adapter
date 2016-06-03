export default {
  post: {
    records: {
      p1: {
        id: 'p1',
        title: 'post #1',
        comments: ['c1', 'missingComment'],
        subscribers: ['externalS1', 'missingSubscriber']
      }
    }
  },

  comment: {
    records: {
      c1: { id: 'c1', title: 'comment #1', post: 'p1' },
      c2: { id: 'c2', title: 'comment #2', post: 'missingPost' },
      c3: { id: 'c3', title: 'comment #3', post: 'p1', author: 'externalA1' },
      c4: { id: 'c4', title: 'comment #3', post: 'p1', author: 'missingAuthor' }
    }
  },
  list: {
    records: {
      l1: { id: 'l1', name: 'one', b: true, items: ['i1', 'i2'], day: 24 },
      l2: { id: 'l2', name: 'two', b: false, items: [], day: 48 },
      l3: { id: 'l3', name: 'three', b: false, items: [], day: 72 }
    }
  },

  item: {
    records: {
      i1: { id: 'i1', name: 'one', list: 'l1' },
      i2: { id: 'i2', name: 'two', list: 'l1' }
    }
  },

  order: {
    records: {
      o1: { id: 'o1', name: 'one', b: true, hours: ['h1', 'h2'] },
      o2: { id: 'o2', name: 'two', b: false, hours: [] },
      o3: { id: 'o3', name: 'three', b: true, hours: ['h3', 'h4'] },
      o4: { id: 'o4', name: 'four', b: true, hours: [] }
    }
  },

  hour: {
    records: {
      h1: { id: 'h1', name: 'one', amount: 4, order: 'o1' },
      h2: { id: 'h2', name: 'two', amount: 3, order: 'o1' },
      h3: { id: 'h3', name: 'three', amount: 2, order: 'o3' },
      h4: { id: 'h4', name: 'four', amount: 1, order: 'o3' }
    }
  },

  customer: {
    records: {
      1: {
        id: '1',
        customerNumber: '123',
        addresses: [
          { id: '1', addressNumber: '12345' },
          { id: '2', addressNumber: '54321' }
        ],
        hour: {
          id: 'h5',
          name: 'five'
        }
      }
    }
  }
};
